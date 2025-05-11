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

type Headers = { [field: string]: string | string[] };

interface Message {
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
      this.db.prepare("PRAGMA synchronous = OFF").run();
    }
    this.db
      .prepare(
        `
         CREATE TABLE IF NOT EXISTS messages ( 
          seq INTEGER, timestamp INTEGER, value BLOB, headers TEXT,
          PRIMARY KEY (seq)
        )`,
      )
      .run();
  };

  close = () => {
    // @ts-ignore
    delete this.options;
    // @ts-ignore
    delete this.db;
  };

  set = (seq: number, mesg: Message): number => {
    const headers = mesg.headers ? JSON.stringify(mesg.headers) : undefined;
    const timestamp = Date.now();
    this.db
      .prepare(
        "INSERT INTO messages(seq, timestamp, value, headers) VALUES(?,?,?,?)",
      )
      .run(seq, timestamp, compress(Buffer.from(mesg.value)), headers);
    return timestamp;
  };

  get = (seq: number): Message => {
    return dbToMessage(
      this.db
        .prepare("SELECT timestamp,value,headers FROM messages WHERE seq=?")
        .get(seq) as any,
    );
  };

  *getAll({
    start_seq,
  }: { start_seq?: number } = {}): IterableIterator<Message> {
    let query: string, stmt;
    if (!start_seq) {
      query = "SELECT seq, timestamp, value, headers FROM messages";
      stmt = this.db.prepare(query);
      for (const row of stmt.iterate()) {
        yield dbToMessage(row);
      }
    } else {
      query =
        "SELECT seq, timestamp, value, headers FROM messages WHERE seq>=?";
      stmt = this.db.prepare(query);
      for (const row of stmt.iterate(start_seq)) {
        yield dbToMessage(row);
      }
    }
  }

  delete = (seq: number) => {
    this.db.prepare("DELETE FROM messages WHERE seq=?").run(seq);
  };
}

function dbToMessage({ timestamp, value, headers }): Message {
  return {
    timestamp,
    value: decompress(value),
    headers: headers ? JSON.parse(headers) : undefined,
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
