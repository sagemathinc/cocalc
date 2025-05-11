/*


*/
import refCache from "@cocalc/util/refcache";
import { createDatabase, type Database } from "./sqlite";

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

  set = (seq: number, mesg: Message) => {
    const headers = mesg.headers ? JSON.stringify(mesg.headers) : undefined;
    this.db
      .prepare(
        "INSERT INTO messages(seq, timestamp, value, headers) VALUES(?,?,?,?)",
      )
      .run(seq, mesg.timestamp, mesg.value, headers);
  };

  get = (seq: number): Message => {
    return this.db
      .prepare("SELECT timestamp,value,headers FROM messages WHERE seq=?")
      .get(seq) as Message;
  };

  getAll = ({ start_seq }: { start_seq?: number } = {}): Message[] => {
    const query = "SELECT seq, timestamp, value, headers FROM messages";
    if (!start_seq) {
      return this.db.prepare(query).all() as Message[];
    } else {
      return this.db
        .prepare(
          "SELECT seq,timestamp,value,headers FROM messages WHERE seq>=?",
        )
        .all(start_seq) as Message[];
    }
  };

  delete = (seq: number) => {
    this.db.prepare("DELETE FROM messages WHERE seq=?").run(seq);
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
