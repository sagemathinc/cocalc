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
import { createDatabase, type Database, compress, decompress } from "./sqlite";
import type { JSONValue } from "@cocalc/util/types";
import { EventEmitter } from "events";

export interface Message {
  // server assigned positive increasing integer number
  seq: number;
  // server assigned time in ms since epoch
  time: number;
  // user assigned key -- when set all previous messages with that key are deleted.
  key?: string;
  // arbitrary binary data -- analogue of NATS payload, but no size limit
  buffer?: Buffer;
  // arbitrary JSON-able object -- analogue of NATS headers, but anything JSON-able
  json?: JSONValue;
}

interface Options {
  // path to a sqlite database file
  path: string;
  // if not set (the default) do not require sync writes to disk on every set
  sync?: boolean;
}

// persistence for stream of messages with subject
export class PersistentStream extends EventEmitter {
  private readonly options: Options;
  private readonly db: Database;

  constructor(options: Options) {
    super();
    this.options = options;
    this.db = createDatabase(`${this.options.path}`);
    this.init();
  }

  init = () => {
    if (!this.options.sync) {
      // Unless sync is set, we do not require that the filesystem has commited changes
      // to disk after every insert. This can easily make things 10x faster.  sets are
      // typically going to come in one-by-one as users edit files, so this works well
      // for our application.  Also, loss of persistence is acceptable in a lot of application,
      // e.g., if it is just edit history for a file.
      this.db.prepare("PRAGMA synchronous=OFF").run();
    }
    this.db
      .prepare(
        `CREATE TABLE IF NOT EXISTS messages ( 
          seq INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT UNIQUE, time INTEGER NOT NULL, json TEXT, buffer BLOB
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

  set = ({
    buffer,
    json,
    key,
  }: {
    buffer: Buffer;
    json?: JSONValue;
    key?: string;
  }): { seq: number; time: number } => {
    const time = Date.now();
    const orig = { buffer, json };

    if (buffer !== undefined) {
      buffer = compress(Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer));
    }
    json = JSON.stringify(json);

    if (key) {
      // insert with key -- delete all previous messages, as they will never be needed again and waste space.
      const tx = this.db.transaction((buffer, json, key, time) => {
        this.db.prepare("DELETE FROM messages WHERE key = ?").run(key);
        return this.db
          .prepare(
            "INSERT INTO messages(time, buffer, json, key) VALUES (?, ?, ?, ?)",
          )
          .run(time / 1000, buffer, json, key);
      });
      const { lastInsertRowid } = tx(buffer, json, key, time);
      const seq = Number(lastInsertRowid);
      this.emit("change", { seq, time, key, ...orig });
      return { time, seq };
    } else {
      // regular insert
      const { lastInsertRowid } = this.db
        .prepare("INSERT INTO messages(time, buffer, json) VALUES (?, ?, ?)")
        .run(time / 1000, buffer, json);
      const seq = Number(lastInsertRowid);
      this.emit("change", { seq, time, ...orig });
      return { time, seq };
    }
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
          "SELECT seq, key, time, buffer, json FROM messages WHERE seq=?",
        )
        .get(seq);
    } else if (key != null) {
      // NOTE: we guarantee when doing set above that there is at most one
      // row with a given key.  Also there's a unique constraint.
      x = this.db
        .prepare(
          "SELECT seq, key, time, buffer, json FROM messages WHERE key=?",
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
      query = "SELECT seq, key, time, buffer, json FROM messages ORDER BY seq";
      stmt = this.db.prepare(query);
      for (const row of stmt.iterate()) {
        yield dbToMessage(row)!;
      }
    } else {
      query =
        "SELECT seq, key, time, buffer, json FROM messages WHERE seq>=? ORDER BY seq";
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
        buffer?: Buffer;
        json?: string;
      }
    | undefined,
): Message | undefined {
  if (x === undefined) {
    return x;
  }
  return {
    seq: x.seq,
    key: x.key != null ? x.key : undefined,
    time: x.time * 1000,
    buffer: x.buffer != null ? decompress(x.buffer) : undefined,
    json: x.json ? JSON.parse(x.json) : undefined,
  };
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
