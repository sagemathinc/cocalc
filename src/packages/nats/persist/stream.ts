/*
Sqlite3 storage of stream values for a particular subject.

The binary buffer value is lz4 compressed as configured in
the sqlite module. In backend, we configured this to use a
very fast synchronous rust lz4 implementation from lz4-napi.
*/

import refCache from "@cocalc/util/refcache";
import { createDatabase, type Database, compress, decompress } from "./sqlite";

type Headers = { [field: string]: string | string[] };

interface Message {
  value: Buffer;
  headers?: Headers;
  timestamp?: number;
}

interface Options {
  subject: string;
  noCache?: boolean;
}

// persistence for stream of messages with subject
export class PersistentStream {
  private subject: string;
  private db: Database;

  constructor(options: Options) {
    this.subject = options.subject;
    this.db = createDatabase(`${this.subject}.db`);
    this.init();
  }

  init = () => {
    this.db
      .prepare(
        `CREATE TABLE IF NOT EXISTS messages ( 
          seq INTEGER, timestamp INTEGER, value BLOB, headers TEXT,
          PRIMARY KEY (seq)
        )`,
      )
      .run();
  };

  close = async () => {};

  set = (seq: number, mesg: Message): number => {
    const headers = mesg.headers ? JSON.stringify(mesg.headers) : undefined;
    const timestamp = Date.now();
    this.db
      .prepare(
        "INSERT INTO messages(seq, timestamp, value, headers) VALUES(?,?,?,?)",
      )
      .run(seq, timestamp, compress(mesg.value), headers);
    return timestamp;
  };

  get = (seq: number): Message => {
    return dbToMessage(
      this.db
        .prepare("SELECT timestamp,value,headers FROM messages WHERE seq=?")
        .get(seq) as any,
    );
  };

  getAll = ({ start_seq }: { start_seq?: number } = {}): Message[] => {
    const query = "SELECT seq, timestamp, value, headers FROM messages";
    if (!start_seq) {
      return this.db.prepare(query).all().map(dbToMessage);
    } else {
      return this.db
        .prepare(
          "SELECT seq,timestamp,value,headers FROM messages WHERE seq>=?",
        )
        .all(start_seq)
        .map(dbToMessage);
    }
  };

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

export const cache = refCache<Options, PersistentStream>({
  name: "persistent-stream",
  createObject: async (options: Options) => {
    const pstream = new PersistentStream(options);
    await pstream.init();
    return pstream;
  },
});
export async function pstream(
  options: Options & { noCache?: boolean },
): Promise<PersistentStream> {
  return await cache(options);
}
