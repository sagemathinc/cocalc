/*
Core storage of stream values to disk.  

This module is very fast and **completely synchronous** and should
be very memory efficient with nothing in memory beyond a single key.

We particular care about memory here since it's likely we'll want to have
possibly thousands of these in a single nodejs process at once, with
very likely less than 1 read/write per second for each.  Thus memory 
is critical, and supporting at least 1000 writes/second is what we need.

Fortunately, this can do ~50,000+ writes per second and read 
over 500,000 per second (testing in Docker on my laptop).  Yes, it 
blocks the main thread, but by using better-sqlite3, we get 10x speed
increases over async code, so this is worth it.

REMARKS:

I implemented *sync* lz4-napi compression here and it's very fast,
but it LEAKS MEMORY HORRIBLY. The async functions in lz4-napi seem fine.
Upstream report (by me): https://github.com/antoniomuso/lz4-napi/issues/678
I also tried the rust snappy and it had a similar memory leak.  Then I tried
zstd-napi and it has a very fast sync implementation that does not leak.
So zstd-napi it is.  And I like zstandard anyways.  Fast and good 
successor to lz4.
*/

import { refCacheSync } from "@cocalc/util/refcache";
import { createDatabase, type Database, compress, decompress } from "./sqlite";
import type { JSONValue } from "@cocalc/util/types";

// headers are meant to be a map from strings to string|string[], but
// we just allow any object, since it's just as easy.
type Headers = JSONValue;

interface Message {
  seq?: number;
  value: Buffer;
  headers?: Headers;
  timestamp?: number;
}

interface Options {
  // path to a sqlite database file
  path: string;
  // if not set (the default) do not require sync writes to disk on every set
  sync?: boolean;
  noCache?: boolean;
}

// persistence for stream of messages with subject
export class PersistentStream {
  private readonly options: Options;
  private readonly db: Database;

  constructor(options: Options) {
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
          seq INTEGER PRIMARY KEY AUTOINCREMENT, timestamp INTEGER, value BLOB, headers TEXT
        )`,
      )
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

  set = (
    value: Buffer,
    {
      headers,
    }: {
      headers?: Headers;
    } = {},
  ): { seq: number; timestamp: number } => {
    const timestamp = Date.now();
    const { lastInsertRowid: seq } = this.db
      .prepare("INSERT INTO messages(timestamp, value, headers) VALUES(?,?,?)")
      .run(
        timestamp,
        compress(Buffer.isBuffer(value) ? value : Buffer.from(value)),
        headers ? JSON.stringify(headers) : undefined,
      );
    return { timestamp, seq: Number(seq) };
  };

  get = (seq: number): Message | undefined => {
    return dbToMessage(
      this.db
        .prepare(
          "SELECT seq, timestamp, value, headers FROM messages WHERE seq=?",
        )
        .get(seq) as any,
    );
  };

  *getAll({
    start_seq,
  }: { start_seq?: number } = {}): IterableIterator<Message> {
    let query: string, stmt;
    if (!start_seq) {
      query =
        "SELECT seq, timestamp, value, headers FROM messages ORDER BY seq";
      stmt = this.db.prepare(query);
      for (const row of stmt.iterate()) {
        yield dbToMessage(row)!;
      }
    } else {
      query =
        "SELECT seq, timestamp, value, headers FROM messages WHERE seq>=? ORDER BY seq";
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
}

function dbToMessage(
  x: (Message & { headers: string }) | undefined,
): Message | undefined {
  if (x === undefined) {
    return x;
  }
  return {
    seq: x.seq,
    timestamp: x.timestamp,
    value: decompress(x.value),
    headers: x.headers ? JSON.parse(x.headers) : undefined,
  };
}

export const cache = refCacheSync<Options, PersistentStream>({
  name: "persistent-stream",
  createObject: (options: Options) => {
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
