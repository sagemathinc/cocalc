/*
Persistent storage of a specific stream or kv store.

You can set a message by providing optionally a key, buffer and/or json value.
A sequence number and time (in ms since epoch) is assigned and returned.
If the key is provided, it is an arbitrary string and all older messages
with that same key are deleted.  You can efficiently retrieve a message
by its key.  The message content itself is given by the buffer and/or json
value.  The buffer is like the "payload" in NATS, and the json is like
the headers in NATS.

This module is:

  - efficient -- buffer is automatically compressed using zstandard
  - synchronous -- fast enough to meet our requirements even with blocking
  - memory efficient -- nothing in memory beyond whatever key you request

We care about memory efficiency here since it's likely we'll want to have
possibly thousands of these in a single nodejs process at once, but with
less than 1 read/write per second for each.  Thus memory is critical, and
supporting at least 1000 writes/second is what we need.
Fortunately, this implementation can do ~50,000+ writes per second and read
over 500,000 per second.  Yes, it blocks the main thread, but by using
sync node:sqlite, we get speed increases over async code, so this is worth it.


COMPRESSION:

I implemented *sync* lz4-napi compression here and it's very fast,
but it has to be run with async waits in a loop or it doesn't give back
memory, and such throttling may significantly negatively impact performance
and mean we don't get a 100% sync api (like we have now).
The async functions in lz4-napi seem fine.  Upstream report (by me):
https://github.com/antoniomuso/lz4-napi/issues/678
I also tried the rust sync snappy and it had a similar memory leak.  Finally,
I tried zstd-napi and it has a very fast sync implementation that does *not*
need async pauses to not leak memory. So zstd-napi it is.
I then switched to the zstd built into nodejs.
And I like zstandard anyways.

TIERED STORAGE:

You can provide a second path archive for the sqlite file.  If provided, on creation,
this will stat both the main path and the archive path.  If the archive path is
newer, then the file is first copied from the archive path to the normal path,
then opened.   Also, if the archive path is provided, then a backup of the database
is made to the archive path periodically.    We use this for tiered storage in
CoCalc as follows.  The archive path is on a Google Cloud Storage autoclass bucket
that is mounted using gcsfuse.  The normal primary path is on a small fast SSD
persistent disk, which we view as a cache.

NOTE:

We use seconds instead of ms in sqlite since that is the standard
convention for times in sqlite.

DEVELOPMENT:


   s = require('@cocalc/backend/conat/persist').pstream({path:'/tmp/a.db'})

*/

import { refCacheSync } from "@cocalc/util/refcache";
import {
  createDatabase,
  type Database,
  compress,
  decompress,
  statSync,
  copyFileSync,
  ensureContainingDirectoryExists,
} from "./context";
import type { JSONValue } from "@cocalc/util/types";
import { EventEmitter } from "events";
import {
  DataEncoding,
  type Headers,
  ConatError,
} from "@cocalc/conat/core/client";
import TTL from "@isaacs/ttlcache";
import { getLogger } from "@cocalc/conat/client";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { throttle } from "lodash";

const logger = getLogger("persist:storage");

export interface PartialInventory {
  // how much space is used by this stream
  bytes: number;
  limits: Partial<Configuration>;
  // number of messages
  count: number;
  // for streams, the seq number up to which this data is valid, i.e.,
  // this data is for all elements of the stream with sequence
  // number <= seq.
  seq: number;
}

export interface Configuration {
  // How many messages may be in a Stream, oldest messages will be removed
  // if the Stream exceeds this size. -1 for unlimited.
  max_msgs: number;

  // Maximum age of any message in the stream,
  // expressed in milliseconds. 0 for unlimited.
  // **Note that max_age is in milliseconds.**
  max_age: number;

  // How big the Stream may be. When the stream size
  // exceeds this, old messages are removed. -1 for unlimited.
  // The size of a message is the sum of the raw uncompressed blob
  // size, the headers json and the key length.
  max_bytes: number;

  // The largest message that will be accepted. -1 for unlimited.
  max_msg_size: number;

  // Attempting to publish a message that causes either of the following
  // two rate limits to be exceeded throws an exception.
  // For dstream, the messages are explicitly rejected and the client
  // gets a "reject" event emitted.  E.g., the terminal running in the project
  // writes [...] when it gets these rejects, indicating that data was dropped.
  // -1 for unlimited
  max_bytes_per_second: number;

  // -1 for unlimited
  max_msgs_per_second: number;

  // old = delete old messages to make room for nw
  // new = refuse writes if they exceed the limits
  discard_policy: "old" | "new";

  // If true (default: false), messages will be automatically deleted after their ttl
  // Use the option {ttl:number of MILLISECONDS} when publishing to set a ttl.
  allow_msg_ttl: boolean;

  // description of this table
  desc: JSONValue;
}

const CONFIGURATION = {
  max_msgs: { def: -1, fromDb: parseInt, toDb: (x) => `${parseInt(x)}` },
  max_age: { def: 0, fromDb: parseInt, toDb: (x) => `${parseInt(x)}` },
  max_bytes: { def: -1, fromDb: parseInt, toDb: (x) => `${parseInt(x)}` },
  max_msg_size: { def: -1, fromDb: parseInt, toDb: (x) => `${parseInt(x)}` },
  max_bytes_per_second: {
    def: -1,
    fromDb: parseInt,
    toDb: (x) => `${parseInt(x)}`,
  },
  max_msgs_per_second: {
    def: -1,
    fromDb: parseInt,
    toDb: (x) => `${parseInt(x)}`,
  },
  discard_policy: {
    def: "old",
    fromDb: (x) => `${x}`,
    toDb: (x) => (x == "new" ? "new" : "old"),
  },
  allow_msg_ttl: {
    def: false,
    fromDb: (x) => x == "true",
    toDb: (x) => `${!!x}`,
  },
  desc: {
    def: null,
    fromDb: JSON.parse,
    toDb: JSON.stringify,
  },
};

export const EPHEMERAL_MAX_BYTES = 64 * 1e6;

enum CompressionAlgorithm {
  None = 0,
  Zstd = 1,
}

interface Compression {
  // compression algorithm to use
  algorithm: CompressionAlgorithm;
  // only compress data above this size
  threshold: number;
}

const DEFAULT_COMPRESSION = {
  algorithm: CompressionAlgorithm.Zstd,
  threshold: 1024,
};

export interface StoredMessage {
  // server assigned positive increasing integer number
  seq: number;
  // server assigned time in ms since epoch
  time: number;
  // user assigned key -- when set all previous messages with that key are deleted.
  key?: string;
  // the encoding used to encode the raw data
  encoding: DataEncoding;
  // arbitrary binary data
  raw: Buffer;
  // arbitrary JSON-able object -- analogue of NATS headers, but anything JSON-able
  headers?: Headers;
}

export interface SetOperation extends StoredMessage {
  op?: undefined;
  msgID?: string;
}

export interface DeleteOperation {
  op: "delete";
  // sequence numbers of deleted messages
  seqs: number[];
}

export const DEFAULT_ARCHIVE_INTERVAL = 30_000; // 30 seconds

export interface StorageOptions {
  // absolute path to sqlite database file.  This needs to be a valid filename
  // path, and must also be kept under 1000 characters in length so it can be
  // stored in cloud storage.
  path: string;
  // another absolute pat.    If this is given, then (1)
  // it will be copied to path before opening path if it is newer, and (2) a
  // backup will be saved to archive (using sqlite's backup feature) every
  // archiveInteral ms.  NOTE: we actually append ".db" to path and to archive.
  archive?: string;
  // the archive interval, if archive is given.  defaults to DEFAULT_ARCHIVE_INTERVAL
  // Depending on your setup, this is likely your tolerance for data loss in the worst case scenario, e.g.,
  // "loss of the last 30 seconds of TimeTravel edit history".
  archiveInterval?: number;
  // another path which will be written to when the database is closed,
  // but not otherwise. NOTE: '.db' is appended to name.
  // this backup is *NOT* used in any way except as a backup; in particular,
  // it won't be used even if archive and path were both gone.
  backup?: string;

  // if false (the default) do not require sync writes to disk on every set
  sync?: boolean;
  // if set, then data is never saved to disk at all. To avoid using a lot of server
  // RAM there is always a hard cap of at most EPHEMERAL_MAX_BYTES on any ephemeral
  // table, which is enforced on all writes.  Clients should always set max_bytes,
  // possibly as low as they can, and check by reading back what is set.
  ephemeral?: boolean;
  // compression configuration
  compression?: Compression;
}

// persistence for stream of messages with subject
export class PersistentStream extends EventEmitter {
  private readonly options: StorageOptions;
  private readonly db: Database;
  private readonly dbPath?: string;
  private readonly msgIDs = new TTL({ ttl: 2 * 60 * 1000 });
  private conf: Configuration;
  private throttledBackup?;

  constructor(options: StorageOptions) {
    super();
    openPaths.add(options.path);
    logger.debug("constructor ", options.path);
    this.setMaxListeners(1000);
    options = { compression: DEFAULT_COMPRESSION, ...options };
    this.options = options;
    const location = this.options.ephemeral
      ? ":memory:"
      : this.options.path + ".db";
    if (location !== ":memory:") {
      this.dbPath = location;
    }
    this.initArchive();
    this.db = createDatabase(location);
    this.initSchema();
  }

  private initArchive = () => {
    if (!this.options.archive) {
      this.throttledBackup = () => {};
      return;
    }
    this.throttledBackup = throttle(
      this.backup,
      this.options.archiveInterval ?? DEFAULT_ARCHIVE_INTERVAL,
    );

    const archive = this.options.archive + ".db";
    const archiveAge = age(archive);

    const path = this.options.path + ".db";
    const pathAge = age(path);

    if (archiveAge > pathAge) {
      copyFileSync(archive, path);
    }
  };

  private initSchema = () => {
    if (!this.options.sync && !this.options.ephemeral) {
      // Unless sync is set, we do not require that the filesystem has commited changes
      // to disk after every insert. This can easily make things 10x faster.  sets are
      // typically going to come in one-by-one as users edit files, so this works well
      // for our application.  Also, loss of a few seconds persistence is acceptable
      // in a lot  of applications, e.g., if it is just edit history for a file.
      this.db.prepare("PRAGMA synchronous=OFF").run();
    }
    // time is in *seconds* since the epoch, since that is standard for sqlite.
    // ttl is in milliseconds.
    this.db
      .prepare(
        `CREATE TABLE IF NOT EXISTS messages (
          seq INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT UNIQUE, time INTEGER NOT NULL, headers TEXT, compress NUMBER NOT NULL, encoding NUMBER NOT NULL, raw BLOB NOT NULL, size NUMBER NOT NULL, ttl NUMBER
          )
        `,
      )
      .run();
    this.db
      .prepare(
        `
         CREATE TABLE IF NOT EXISTS config (
          field TEXT PRIMARY KEY, value TEXT NOT NULL
        )`,
      )
      .run();
    this.db
      .prepare("CREATE INDEX IF NOT EXISTS idx_messages_key ON messages(key)")
      .run();
    this.db
      .prepare("CREATE INDEX IF NOT EXISTS idx_messages_time ON messages(time)")
      .run();

    this.conf = this.config();
  };

  close = async () => {
    const path = this.options?.path;
    if (path == null) {
      return;
    }
    logger.debug("close ", path);
    if (this.db != null) {
      this.vacuum();
      this.db.prepare("PRAGMA wal_checkpoint(FULL)").run();
      await this.backup();
      if (this.options.backup) {
        await this.backup(this.options.backup);
      }
      this.db.close();
    }
    // @ts-ignore
    delete this.options;
    this.msgIDs?.clear();
    // @ts-ignore
    delete this.msgIDs;
    openPaths.delete(path);
  };

  private backup = reuseInFlight(async (path?: string): Promise<void> => {
    if (this.options == null) {
      // can happen due to this.throttledBackup.
      return;
    }
    // reuseInFlight since probably doing a backup on top
    // of itself would corrupt data.
    if (path === undefined && !this.options.archive) {
      return;
    }
    if (!this.dbPath) {
      return;
    }
    const dest = (path ?? this.options.archive) + ".db";
    //console.log("backup", { path });
    try {
      await ensureContainingDirectoryExists(dest);
      copyFileSync(this.dbPath, dest);
    } catch (err) {
      if (!process.env.COCALC_TEST_MODE) {
        console.log(err);
      }
      logger.debug("WARNING: error creating a backup", dest, err);
    }
  });

  private runTransaction = <T>(fn: () => T): T => {
    this.db.exec("BEGIN");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (err) {
      try {
        this.db.exec("ROLLBACK");
      } catch {}
      throw err;
    }
  };

  private compress = (
    raw: Buffer,
  ): { raw: Buffer; compress: CompressionAlgorithm } => {
    if (
      this.options.compression!.algorithm == CompressionAlgorithm.None ||
      raw.length <= this.options.compression!.threshold
    ) {
      return { raw, compress: CompressionAlgorithm.None };
    }
    if (this.options.compression!.algorithm == CompressionAlgorithm.Zstd) {
      return { raw: compress(raw), compress: CompressionAlgorithm.Zstd };
    }
    throw Error(
      `unknown compression algorithm: ${this.options.compression!.algorithm}`,
    );
  };

  set = ({
    encoding,
    raw,
    headers,
    key,
    ttl,
    previousSeq,
    msgID,
  }: {
    encoding: DataEncoding;
    raw: Buffer;
    headers?: JSONValue;
    key?: string;
    ttl?: number;
    previousSeq?: number;
    // if given, any attempt to publish something again with the same msgID
    // is deduplicated. Use this to prevent accidentally writing twice, e.g.,
    // due to not getting a response back from the server.
    msgID?: string;
  }): { seq: number; time: number } => {
    if (previousSeq === null) {
      previousSeq = undefined;
    }
    if (key === null) {
      key = undefined;
    }
    if (msgID != null && this.msgIDs?.has(msgID)) {
      return this.msgIDs.get(msgID)!;
    }
    if (key !== undefined && previousSeq !== undefined) {
      // throw error if current seq number for the row
      // with this key is not previousSeq.
      const { seq } = this.db // there is an index on the key so this is fast
        .prepare("SELECT seq FROM messages WHERE key=?")
        .get(key) as any;
      if (seq != previousSeq) {
        throw new ConatError("wrong last sequence", {
          code: "wrong-last-sequence",
        });
      }
    }
    const time = Date.now();
    const compressedRaw = this.compress(raw);
    const serializedHeaders = JSON.stringify(headers);
    const size =
      (serializedHeaders?.length ?? 0) +
      (raw?.length ?? 0) +
      (key?.length ?? 0);

    this.enforceLimits(size);

    const row = this.runTransaction(() => {
      if (key !== undefined) {
        this.db.prepare("DELETE FROM messages WHERE key = ?").run(key);
      }
      return this.db
        .prepare(
          "INSERT INTO messages(time, compress, encoding, raw, headers, key, size, ttl) VALUES (?, ?, ?, ?, ?, ?, ?, ?)  RETURNING seq",
        )
        .get(
          time / 1000,
          compressedRaw.compress,
          encoding,
          compressedRaw.raw,
          serializedHeaders,
          key ?? null,
          size,
          ttl ?? null,
        );
    });
    const seq = Number((row as any).seq);
    // lastInsertRowid - is a bigint from sqlite, but we won't hit that limit
    this.emit("change", {
      seq,
      time,
      key,
      encoding,
      raw,
      headers,
      msgID,
    });
    this.throttledBackup();
    if (msgID !== undefined) {
      this.msgIDs.set(msgID, { time, seq });
    }
    return { time, seq };
  };

  get = ({
    seq,
    key,
  }: { seq: number; key: undefined } | { seq: undefined; key: string }):
    | StoredMessage
    | undefined => {
    let x;
    const ttl = this.conf.allow_msg_ttl ? ", ttl" : "";
    if (seq) {
      x = this.db
        .prepare(
          `SELECT seq, key, time, compress, encoding, raw, headers${ttl} FROM messages WHERE seq=?`,
        )
        .get(seq);
    } else if (key != null) {
      // NOTE: we guarantee when doing set above that there is at most one
      // row with a given key.  Also there's a unique constraint.
      x = this.db
        .prepare(
          `SELECT seq, key, time, compress, encoding, raw, headers${ttl} FROM messages WHERE key=?`,
        )
        .get(key);
    } else {
      x = undefined;
    }
    return dbToMessage(x as any);
  };

  *getAll({
    start_seq,
    end_seq,
  }: {
    end_seq?: number;
    start_seq?: number;
  } = {}): IterableIterator<StoredMessage> {
    let query: string, stmt;

    const where: string[] = [];
    const v: number[] = [];
    if (start_seq != null) {
      where.push("seq>=?");
      v.push(start_seq);
    }
    if (end_seq != null) {
      where.push("seq<=?");
      v.push(end_seq);
    }
    query = `SELECT seq, key, time, compress, encoding, raw, headers FROM messages ${where.length == 0 ? "" : " where " + where.join(" AND ")} ORDER BY seq`;
    stmt = this.db.prepare(query);
    for (const row of stmt.iterate(...v)) {
      yield dbToMessage(row)!;
    }
  }

  delete = ({
    seq,
    seqs: seqs0,
    last_seq,
    all,
  }: {
    seq?: number;
    seqs?: number[];
    last_seq?: number;
    all?: boolean;
  }): { seqs: number[] } => {
    let seqs: number[] = [];
    if (all) {
      seqs = this.db
        .prepare("SELECT seq FROM messages")
        .all()
        .map((row: any) => row.seq);
      this.db.prepare("DELETE FROM messages").run();
      this.vacuum();
    } else if (last_seq) {
      seqs = this.db
        .prepare("SELECT seq FROM messages WHERE seq<=?")
        .all(last_seq)
        .map((row: any) => row.seq);
      this.db.prepare("DELETE FROM messages WHERE seq<=?").run(last_seq);
      this.vacuum();
    } else if (seq) {
      seqs = this.db
        .prepare("SELECT seq FROM messages WHERE seq=?")
        .all(seq)
        .map((row: any) => row.seq);
      this.db.prepare("DELETE FROM messages WHERE seq=?").run(seq);
    } else if (seqs0) {
      const statement = this.db.prepare("DELETE FROM messages WHERE seq=?");
      this.runTransaction(() => {
        for (const s of seqs0) {
          statement.run(s);
        }
      });
      seqs = seqs0;
    }
    this.emit("change", { op: "delete", seqs });
    this.throttledBackup();
    return { seqs };
  };

  vacuum = () => {
    try {
      this.db.prepare("VACUUM").run();
    } catch {}
  };

  get length(): number {
    const { length } = this.db
      .prepare("SELECT COUNT(*) AS length FROM messages")
      .get() as { length: number };
    return length;
  }

  totalSize = (): number => {
    return (
      (this.db.prepare(`SELECT SUM(size) AS sum FROM messages`).get() as any)
        .sum ?? 0
    );
  };

  seq = (): number => {
    return (
      (this.db.prepare(`SELECT MAX(seq) AS seq FROM messages`).get() as any)
        .seq ?? 0
    );
  };

  inventory = (): PartialInventory => {
    return {
      bytes: this.totalSize(),
      count: this.length,
      limits: this.getConfig(),
      seq: this.seq(),
    };
  };

  keys = (): string[] => {
    const v = this.db
      .prepare("SELECT key FROM messages WHERE key IS NOT NULL")
      .all() as {
      key: string;
    }[];
    return v.map(({ key }) => key);
  };

  sqlite = (statement: string, params: any[] = []): any[] => {
    // Matches "attach database" (case-insensitive, ignores whitespace)
    if (/\battach\s+database\b/i.test(statement)) {
      throw Error("ATTACH DATABASE not allowed");
    }
    const stmt = this.db.prepare(statement);
    try {
      return stmt.all(...params);
    } catch (err) {
      if (err.message.includes("run() instead")) {
        stmt.run(...params);
        return [];
      } else {
        throw err;
      }
    }
  };

  // only returns fields that are not set to their default value,
  // and doesn't enforce any limits
  getConfig = (): Partial<Configuration> => {
    const cur: any = {};
    for (const { field, value } of this.db
      .prepare("SELECT * FROM config")
      .all() as any) {
      const { def, fromDb } = CONFIGURATION[field];
      cur[field] = fromDb(value);
      if (cur[field] == def) {
        delete cur[field];
      }
    }
    return cur;
  };

  config = (config?: Partial<Configuration>): Configuration => {
    const cur: any = {};
    for (const { field, value } of this.db
      .prepare("SELECT * FROM config")
      .all() as any) {
      cur[field] = value;
    }
    const full: Partial<Configuration> = {};
    for (const key in CONFIGURATION) {
      const { def, fromDb, toDb } = CONFIGURATION[key];
      full[key] =
        config?.[key] ?? (cur[key] !== undefined ? fromDb(cur[key]) : def);
      let x = toDb(full[key]);
      if (config?.[key] != null && full[key] != (cur[key] ?? def)) {
        // making a change
        this.db
          .prepare(
            `INSERT INTO config (field, value) VALUES(?, ?) ON CONFLICT(field) DO UPDATE SET value=excluded.value`,
          )
          .run(key, x);
      }
      full[key] = fromDb(x);
      if (
        this.options.ephemeral &&
        key == "max_bytes" &&
        (full[key] == null || full[key] <= 0 || full[key] > EPHEMERAL_MAX_BYTES)
      ) {
        // for ephemeral we always make it so max_bytes is capped
        // (note -- this isn't explicitly set in the sqlite database, since we might
        // change it, and by not setting it in the database we can)
        full[key] = EPHEMERAL_MAX_BYTES;
      }
    }
    this.conf = full as Configuration;
    // ensure any new limits are enforced
    this.enforceLimits(0);
    this.throttledBackup();
    return full as Configuration;
  };

  private emitDelete = (rows) => {
    if (rows.length > 0) {
      const seqs = rows.map((row: { seq: number }) => row.seq);
      this.emit("change", { op: "delete", seqs });
      this.throttledBackup();
    }
  };

  // do whatever limit enforcement and throttling is needed when inserting one new message
  // with the given size; if size=0 assume not actually inserting a new message, and just
  // enforcingt current limits
  private enforceLimits = (size: number = 0) => {
    if (
      size > 0 &&
      (this.conf.max_msgs_per_second > 0 || this.conf.max_bytes_per_second > 0)
    ) {
      const { msgs, bytes } = this.db
        .prepare(
          "SELECT COUNT(*) AS msgs, SUM(size) AS bytes FROM messages WHERE time >= ?",
        )
        .get(Date.now() / 1000 - 1) as { msgs: number; bytes: number };
      if (
        this.conf.max_msgs_per_second > 0 &&
        msgs > this.conf.max_msgs_per_second
      ) {
        throw new ConatError("max_msgs_per_second exceeded", {
          code: "reject",
        });
      }
      if (
        this.conf.max_bytes_per_second > 0 &&
        bytes > this.conf.max_bytes_per_second
      ) {
        throw new ConatError("max_bytes_per_second exceeded", {
          code: "reject",
        });
      }
    }

    if (this.conf.max_msgs > -1) {
      const length = this.length + (size > 0 ? 1 : 0);
      if (length > this.conf.max_msgs) {
        if (this.conf.discard_policy == "new") {
          if (size > 0) {
            throw new ConatError("max_msgs limit reached", { code: "reject" });
          }
        } else {
          // delete earliest messages to make room
          const rows = this.db
            .prepare(
              `DELETE FROM messages WHERE seq IN (SELECT seq FROM messages ORDER BY seq ASC LIMIT ?) RETURNING seq`,
            )
            .all(length - this.conf.max_msgs);
          this.emitDelete(rows);
        }
      }
    }

    if (this.conf.max_age > 0) {
      const rows = this.db
        .prepare(
          `DELETE FROM messages WHERE seq IN (SELECT seq FROM messages WHERE time <= ?) RETURNING seq`,
        )
        .all((Date.now() - this.conf.max_age) / 1000);
      this.emitDelete(rows);
    }

    if (this.conf.max_bytes > -1) {
      if (size > this.conf.max_bytes) {
        if (this.conf.discard_policy == "new") {
          if (size > 0) {
            throw new ConatError("max_bytes limit reached", { code: "reject" });
          }
        } else {
          // new message exceeds total, so this is the same as adding in the new message,
          // then deleting everything.
          this.delete({ all: true });
        }
      } else {
        // delete all the earliest (in terms of seq number) messages
        // so that the sum of the remaining
        // sizes along with the new size is <= max_bytes.
        // Only enforce if actually inserting, or if current sum is over
        const totalSize = this.totalSize();
        const newTotal = totalSize + size;
        if (newTotal > this.conf.max_bytes) {
          const bytesToFree = newTotal - this.conf.max_bytes;
          let freed = 0;
          let lastSeqToDelete: number | null = null;

          for (const { seq, size: msgSize } of this.db
            .prepare(`SELECT seq, size FROM messages ORDER BY seq ASC`)
            .iterate() as any) {
            if (freed >= bytesToFree) break;
            freed += msgSize;
            lastSeqToDelete = seq;
          }

          if (lastSeqToDelete !== null) {
            if (this.conf.discard_policy == "new") {
              if (size > 0) {
                throw new ConatError("max_bytes limit reached", {
                  code: "reject",
                });
              }
            } else {
              const rows = this.db
                .prepare(`DELETE FROM messages WHERE seq <= ? RETURNING seq`)
                .all(lastSeqToDelete);
              this.emitDelete(rows);
            }
          }
        }
      }
    }

    if (this.conf.allow_msg_ttl) {
      const rows = this.db
        .prepare(
          `DELETE FROM messages WHERE ttl IS NOT null AND time + ttl/1000 < ? RETURNING seq`,
        )
        .all(Date.now() / 1000);
      this.emitDelete(rows);
    }

    if (this.conf.max_msg_size > -1 && size > this.conf.max_msg_size) {
      throw new ConatError(
        `max_msg_size of ${this.conf.max_msg_size} bytes exceeded`,
        { code: "reject" },
      );
    }
  };
}

function dbToMessage(
  x:
    | {
        seq: number;
        key?: string;
        time: number;
        compress: CompressionAlgorithm;
        encoding: DataEncoding;
        raw: Buffer;
        headers?: string;
        ttl?: number;
      }
    | undefined,
): StoredMessage | undefined {
  if (x === undefined) {
    return x;
  }
  if (x.ttl && Date.now() - 1000 * x.time >= x.ttl) {
    // the actual record will get cleared eventually from the
    // database when enforceLimits is called.  For now we
    // just returned undefined.  The check here makes it so
    // ttl fully works as claimed, rather than "eventually", i.e.,
    // it can be used for a short-term lock, rather than just
    // being something for saving space longterm.
    return undefined;
  }
  return {
    seq: x.seq,
    time: x.time * 1000,
    key: x.key != null ? x.key : undefined,
    encoding: x.encoding,
    raw: handleDecompress(x),
    headers: x.headers ? JSON.parse(x.headers) : undefined,
  };
}

function handleDecompress({
  raw,
  compress,
}: {
  raw: Buffer;
  compress: CompressionAlgorithm;
}) {
  if (compress == CompressionAlgorithm.None) {
    return raw;
  } else if (compress == CompressionAlgorithm.Zstd) {
    return decompress(raw);
  } else {
    throw Error(`unknown compression ${compress}`);
  }
}

interface CreateOptions extends StorageOptions {
  noCache?: boolean;
}

export const openPaths = new Set<string>();

export const cache = refCacheSync<CreateOptions, PersistentStream>({
  name: "persistent-storage-stream",
  createKey: ({ path }: CreateOptions) => path,
  createObject: (options: CreateOptions) => {
    return new PersistentStream(options);
  },
});

export function pstream(
  options: StorageOptions & { noCache?: boolean },
): PersistentStream {
  return cache(options);
}

function age(path: string) {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return 0;
  }
}
