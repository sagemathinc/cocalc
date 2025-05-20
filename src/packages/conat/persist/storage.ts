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
*/

import { refCacheSync } from "@cocalc/util/refcache";
import { createDatabase, type Database, compress, decompress } from "./context";
import type { JSONValue } from "@cocalc/util/types";
import { EventEmitter } from "events";
import { DataEncoding, type Headers } from "@cocalc/conat/core/client";

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
    this.db
      .prepare(
        `CREATE TABLE IF NOT EXISTS messages ( 
          seq INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT UNIQUE, time INTEGER NOT NULL, headers TEXT, compress NUMBER NOT NULL, encoding NUMBER NOT NULL, raw BLOB NOT NULL
        )`,
      )
      .run();
    this.db
      .prepare("CREATE INDEX IF NOT EXISTS idx_messages_key ON messages(key)")
      .run();
  };

  close = () => {
    this.vacuum();
    this.db?.close();
    // @ts-ignore
    delete this.options;
    // @ts-ignore
    delete this.db;
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
  }: {
    encoding: DataEncoding;
    raw: Buffer;
    headers?: JSONValue;
    key?: string;
  }): { seq: number; time: number } => {
    const time = Date.now();
    const compressedRaw = this.compress(raw);
    const serializedHeaders = JSON.stringify(headers);
    const tx = this.db.transaction(
      (time, compress, encoding, raw, headers, key) => {
        if (key) {
          // insert with key -- delete all previous messages, as they will
          // never be needed again and waste huge amounts of space.
          this.db.prepare("DELETE FROM messages WHERE key = ?").run(key);
        }
        return this.db
          .prepare(
            "INSERT INTO messages(time, compress, encoding, raw, headers, key) VALUES (?, ?, ?, ?, ?, ?)  RETURNING seq",
          )
          .get(time / 1000, compress, encoding, raw, headers, key);
      },
    );
    const row = tx(
      time,
      compressedRaw.compress,
      encoding,
      compressedRaw.raw,
      serializedHeaders,
      key,
    );
    const seq = Number((row as any).seq);
    // lastInsertRowid - is a bigint from sqlite, but we won't hit that limit
    this.emit("change", { seq, time, key, encoding, raw, headers });
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
  }: { start_seq?: number } = {}): IterableIterator<Message> {
    let query: string, stmt;
    if (!start_seq) {
      query =
        "SELECT seq, key, time, compress, encoding, raw, headers FROM messages ORDER BY seq";
      stmt = this.db.prepare(query);
      for (const row of stmt.iterate()) {
        yield dbToMessage(row)!;
      }
    } else {
      query =
        "SELECT seq, key, time, compress, encoding, raw, headers FROM messages WHERE seq>=? ORDER BY seq";
      stmt = this.db.prepare(query);
      for (const row of stmt.iterate(start_seq)) {
        yield dbToMessage(row)!;
      }
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
  }) => {
    if (all) {
      this.db.prepare("DELETE FROM messages").run();
      this.vacuum();
    } else if (last_seq) {
      this.db.prepare("DELETE FROM messages WHERE seq<=?").run(last_seq);
      this.vacuum();
    } else if (seq) {
      this.db.prepare("DELETE FROM messages WHERE seq=?").run(seq);
    }
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
