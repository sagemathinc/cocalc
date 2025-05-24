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
better-sqlite3 and zstd-napi, we get 10x speed increases over async code, 
so this is worth it.


COMPRESSION:

I implemented *sync* lz4-napi compression here and it's very fast,
but it LEAKS MEMORY HORRIBLY. The async functions in lz4-napi seem fine.
Upstream report (by me): https://github.com/antoniomuso/lz4-napi/issues/678
I also tried the rust sync snappy and it had a similar memory leak.  Finally,
I tried zstd-napi and it has a very fast sync implementation that does *not*
leak memory. So zstd-napi it is.  And I like zstandard anyways.

NOTE:

We use seconds instead of ms in sqlite since that is the standard 
convention for times in sqlite.

DEVELOPMENT:


   s = require('@cocalc/backend/conat/persist').pstream({path:'/tmp/a.db'})

*/

import { refCacheSync } from "@cocalc/util/refcache";
import { createDatabase, type Database, compress, decompress } from "./context";
import type { JSONValue } from "@cocalc/util/types";
import { EventEmitter } from "events";
import {
  DataEncoding,
  type Headers,
  ConatError,
} from "@cocalc/conat/core/client";
import TTL from "@isaacs/ttlcache";

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
};

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

export interface Message {
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

export interface SetOperation extends Message {
  op: undefined;
  msgID?: string;
}

export interface DeleteOperation {
  op: "delete";
  // sequence numbers of deleted messages
  seqs: number[];
}

export interface Options {
  // absolute path to sqlite database file.  This needs to be a valid filename
  // path, and must also be kept under 1K so it can be stored in cloud storage.
  path: string;
  // if false (the default) do not require sync writes to disk on every set
  sync?: boolean;
  // if set, then data is never saved to disk at all. This is very dangerous
  // for production, since it could use a LOT of RAM -- but could be very useful
  // for unit testing.
  ephemeral?: boolean;
  // compression configuration
  compression?: Compression;
}

// persistence for stream of messages with subject
export class PersistentStream extends EventEmitter {
  private readonly options: Options;
  private readonly db: Database;
  private readonly msgIDs = new TTL({ ttl: 2 * 60 * 1000 });
  private conf: Configuration;

  constructor(options: Options) {
    super();
    options = { compression: DEFAULT_COMPRESSION, ...options };
    this.options = options;
    this.db = createDatabase(
      this.options.ephemeral ? ":memory:" : this.options.path,
    );
    this.init();
  }

  init = () => {
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

  close = () => {
    this.vacuum();
    this.db?.close();
    // @ts-ignore
    delete this.options;
    // @ts-ignore
    delete this.db;
    this.msgIDs?.clear();
    // @ts-ignore
    delete this.msgIDs;
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
    if (msgID !== undefined && this.msgIDs?.has(msgID)) {
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

    const tx = this.db.transaction(
      (time, compress, encoding, raw, headers, key, size, ttl) => {
        if (key !== undefined) {
          // insert with key -- delete all previous messages, as they will
          // never be needed again and waste space.
          this.db.prepare("DELETE FROM messages WHERE key = ?").run(key);
        }
        return this.db
          .prepare(
            "INSERT INTO messages(time, compress, encoding, raw, headers, key, size, ttl) VALUES (?, ?, ?, ?, ?, ?, ?, ?)  RETURNING seq",
          )
          .get(time / 1000, compress, encoding, raw, headers, key, size, ttl);
      },
    );
    const row = tx(
      time,
      compressedRaw.compress,
      encoding,
      compressedRaw.raw,
      serializedHeaders,
      key,
      size,
      ttl,
    );
    const seq = Number((row as any).seq);
    // lastInsertRowid - is a bigint from sqlite, but we won't hit that limit
    this.emit("change", {
      op: "set",
      seq,
      time,
      key,
      encoding,
      raw,
      headers,
      msgID,
    });
    if (msgID !== undefined) {
      this.msgIDs.set(msgID, { time, seq });
    }
    return { time, seq };
  };

  get = ({
    seq,
    key,
  }: { seq: number; key: undefined } | { seq: undefined; key: string }):
    | Message
    | undefined => {
    let x;
    if (seq) {
      x = this.db
        .prepare(
          "SELECT seq, key, time, compress, encoding, raw, headers FROM messages WHERE seq=?",
        )
        .get(seq);
    } else if (key != null) {
      // NOTE: we guarantee when doing set above that there is at most one
      // row with a given key.  Also there's a unique constraint.
      x = this.db
        .prepare(
          "SELECT seq, key, time, compress, encoding, raw, headers FROM messages WHERE key=?",
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
  }: { end_seq?: number; start_seq?: number } = {}): IterableIterator<Message> {
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
    last_seq,
    all,
  }: {
    seq?: number;
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
    }
    this.emit("change", { op: "delete", seqs });
    return { seqs };
  };

  vacuum = () => {
    this.db.prepare("VACUUM").run();
  };

  get length(): number {
    const { length } = this.db
      .prepare("SELECT COUNT(*) AS length FROM messages")
      .get() as { length: number };
    return length;
  }

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
      const x = toDb(full[key]);
      if (config?.[key] != null && full[key] != (cur[key] ?? def)) {
        // making a change
        this.db
          .prepare(
            `INSERT INTO config (field, value) VALUES(?, ?) ON CONFLICT(field) DO UPDATE SET value=excluded.value`,
          )
          .run(key, x);
      }
      full[key] = fromDb(x);
    }
    this.conf = full as Configuration;
    // ensure any new limits are enforced
    this.enforceLimits(0);
    return full as Configuration;
  };

  private emitDelete = (rows) => {
    if (rows.length > 0) {
      const seqs = rows.map((row: { seq: number }) => row.seq);
      this.emit("change", { op: "delete", seqs });
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
        // delete all the earliest (in terms of seq number) messages so that the sum of the remaining
        // sizes along with the new size is <= max_bytes.
        // Only enforce if actually inserting, or if current sum is over
        const totalSize =
          (
            this.db
              .prepare(`SELECT SUM(size) AS sum FROM messages`)
              .get() as any
          ).sum ?? 0;
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
      }
    | undefined,
): Message | undefined {
  if (x === undefined) {
    return x;
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

export const cache = refCacheSync<
  Options & { noCache?: boolean },
  PersistentStream
>({
  name: "persistent-stream",
  createObject: (options: Options & { noCache?: boolean }) => {
    const pstream = new PersistentStream(options);
    pstream.init();
    return pstream;
  },
});

export function pstream(
  options: Options & { noCache?: boolean },
): PersistentStream {
  return cache(options);
}
