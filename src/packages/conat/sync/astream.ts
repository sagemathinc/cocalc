/*
Asynchronous Memory Efficient Access to Core Stream.

This provides access to the same data as dstream, except it doesn't download any
data to the client until you actually call get.   The calls to get and
set are thus async.

There is no need to close this because it is stateless.

[ ] TODO: efficiently get or set many values at once in a single call. This will be
very useful, e.g., for jupyter notebook timetravel browsing.

DEVELOPMENT:

~/cocalc/src/packages/backend$ node

a = await require("@cocalc/backend/conat/sync").dstream({name:'test'})


b = require("@cocalc/backend/conat/sync").astream({name:'test'})
const {seq} = await b.push('x')

a.get() // ['x']

await b.get(seq) //  'x'

*/

import {
  type StorageOptions,
  type PersistStreamClient,
  stream,
} from "@cocalc/conat/persist/client";
import { type DStreamOptions } from "./dstream";
import {
  type Headers,
  messageData,
  type Client,
  Message,
  decode,
} from "@cocalc/conat/core/client";
import { storagePath, type User } from "./core-stream";
import { connect } from "@cocalc/conat/core/client";
import { type Configuration } from "@cocalc/conat/persist/storage";

export class AStream<T = any> {
  private storage: StorageOptions;
  private user: User;
  private stream: PersistStreamClient;
  private client: Client;

  constructor(options: DStreamOptions) {
    this.user = {
      account_id: options.account_id,
      project_id: options.project_id,
    };
    this.storage = { path: storagePath(options) };
    this.client = options.client ?? connect();
    this.stream = stream({
      client: this.client,
      user: this.user,
      storage: this.storage,
    });
  }

  close = () => {
    this.stream.close();
  };

  getMessage = async (
    seq_or_key: number | string,
    { timeout }: { timeout?: number } = {},
  ): Promise<Message<T> | undefined> => {
    return await this.stream.get({
      ...opt(seq_or_key),
      timeout,
    });
  };

  get = async (
    seq_or_key: number | string,
    opts?: { timeout?: number },
  ): Promise<T | undefined> => {
    return (await this.getMessage(seq_or_key, opts))?.data;
  };

  headers = async (
    seq_or_key: number | string,
    opts?: { timeout?: number },
  ): Promise<Headers | undefined> => {
    return (await this.getMessage(seq_or_key, opts))?.headers;
  };

  // this is an async iterator so you can iterate over the
  // data without having to have it all in RAM at once.
  // Of course, you can put it all in a single list if you want.
  async *getAll(opts): AsyncGenerator<
    {
      mesg: T;
      headers?: Headers;
      seq: number;
      time: number;
      key?: string;
    },
    void,
    unknown
  > {
    for await (const messages of this.stream.getAll(opts)) {
      for (const { seq, time, key, encoding, raw, headers } of messages) {
        const mesg = decode({ encoding, data: raw });
        yield { mesg, headers, seq, time, key };
      }
    }
  }

  async *changefeed(): AsyncGenerator<
    | {
        op: "set";
        mesg: T;
        headers?: Headers;
        seq: number;
        time: number;
        key?: string;
      }
    | { op: "delete"; seqs: number[] },
    void,
    unknown
  > {
    const cf = await this.stream.changefeed();
    for await (const { updates } of cf) {
      for (const event of updates) {
        if (event.op == "delete") {
          yield event;
        } else {
          const { seq, time, key, encoding, raw, headers } = event;
          const mesg = decode({ encoding, data: raw });
          yield { op: "set", mesg, headers, seq, time, key };
        }
      }
    }
  }

  delete = async (opts: {
    timeout?: number;
    seq?: number;
    last_seq?: number;
    all?: boolean;
  }): Promise<{ seqs: number[] }> => {
    return await this.stream.delete(opts);
  };

  publish = async (
    value: T,
    options?: {
      headers?: Headers;
      previousSeq?: number;
      timeout?: number;
      key?: string;
      ttl?: number;
      msgID?: string;
    },
  ): Promise<{ seq: number; time: number }> => {
    const { headers, ...options0 } = options ?? {};
    return await this.stream.set({
      messageData: messageData(value, { headers }),
      ...options0,
    });
  };

  push = async (...args: T[]): Promise<{ seq: number; time: number }[]> => {
    // [ ] TODO: should break this up into chunks with a limit on size.
    const ops = args.map((mesg) => {
      return { messageData: messageData(mesg) };
    });
    return await this.stream.setMany(ops);
  };

  config = async (
    config: Partial<Configuration> = {},
  ): Promise<Configuration> => {
    if (this.storage == null) {
      throw Error("bug -- storage must be set");
    }
    return await this.stream.config({ config });
  };

  sqlite = async (
    statement: string,
    params?: any[],
    { timeout }: { timeout?: number } = {},
  ): Promise<any[]> => {
    return await this.stream.sqlite({
      timeout,
      statement,
      params,
    });
  };
}

export function astream<T>(opts: DStreamOptions) {
  return new AStream<T>(opts);
}

function opt(seq_or_key: number | string): { seq: number } | { key: string } {
  const t = typeof seq_or_key;
  if (t == "number") {
    return { seq: seq_or_key as number };
  } else if (t == "string") {
    return { key: seq_or_key as string };
  }
  throw Error(`arg must be number or string`);
}
