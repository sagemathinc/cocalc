/*
Asynchronous Memory-Efficient Access to Key:Value Store

This provides access to the same data as dkv, except it doesn't download any
data to the client until you actually call get.   The calls to get and
set are thus async.

There is no need to close this because it is stateless.

[ ] TODO: efficiently get or set many values at once in a single call. This will be
very useful, e.g., for jupyter notebook timetravel browsing.

DEVELOPMENT:

~/cocalc/src/packages/backend$ node

a = await require("@cocalc/backend/conat/sync").dkv({name:'test'}); a.set('x',5)


b = require("@cocalc/backend/conat/sync").akv({name:'test'})
await b.set('x',10)

a.get('x')

await b.get('x')

*/

import {
  type StorageOptions,
  type PersistStreamClient,
  stream,
} from "@cocalc/conat/persist/client";
import { type DKVOptions } from "./dkv";
import {
  type Headers,
  messageData,
  type Message,
} from "@cocalc/conat/core/client";
import { storagePath, type User, COCALC_TOMBSTONE_HEADER } from "./core-stream";
import { connect } from "@cocalc/conat/core/client";

export class AKV<T = any> {
  private storage: StorageOptions;
  private user: User;
  private stream: PersistStreamClient;

  constructor(options: DKVOptions) {
    this.user = {
      account_id: options.account_id,
      project_id: options.project_id,
    };
    this.storage = { path: storagePath(options) };
    const client = options.client ?? connect();
    this.stream = stream({
      client,
      user: this.user,
      storage: this.storage,
    });
  }

  close = () => {
    this.stream.close();
  };

  getMessage = async (
    key: string,
    { timeout }: { timeout?: number } = {},
  ): Promise<Message<T> | undefined> => {
    const mesg = await this.stream.get({ key, timeout });
    if (mesg?.headers?.[COCALC_TOMBSTONE_HEADER]) {
      return undefined;
    }
    return mesg;
  };

  //   // Just get one value asynchronously, rather than the entire dkv.
  //   // If the timeout option is given and the value of key is not set,
  //   // will wait until that many ms to get the key.
  get = async (
    key: string,
    opts?: { timeout?: number },
  ): Promise<T | undefined> => {
    return (await this.getMessage(key, opts))?.data;
  };

  headers = async (
    key: string,
    opts?: { timeout?: number },
  ): Promise<Headers | undefined> => {
    return (await this.getMessage(key, opts))?.headers;
  };

  time = async (
    key: string,
    opts?: { timeout?: number },
  ): Promise<Date | undefined> => {
    const time = (await this.getMessage(key, opts))?.headers?.time;
    return time !== undefined ? new Date(time as number) : undefined;
  };

  delete = async (key: string, opts?: { timeout?: number }): Promise<void> => {
    await this.set(key, null as any, {
      ...opts,
      headers: { [COCALC_TOMBSTONE_HEADER]: true },
    });
  };

  seq = async (
    key: string,
    opts?: { timeout?: number },
  ): Promise<number | undefined> => {
    return (await this.getMessage(key, opts))?.headers?.seq as
      | number
      | undefined;
  };

  set = async (
    key: string,
    value: T,
    options?: {
      headers?: Headers;
      previousSeq?: number;
      timeout?: number;
      ttl?: number;
      msgID?: string;
    },
  ): Promise<{ seq: number; time: number }> => {
    const { headers, ...options0 } = options ?? {};
    return await this.stream.set({
      key,
      messageData: messageData(value, { headers }),
      ...options0,
    });
  };

  keys = async ({ timeout }: { timeout?: number } = {}): Promise<string[]> => {
    return await this.stream.keys({
      timeout,
    });
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

export function akv<T>(opts: DKVOptions) {
  return new AKV<T>(opts);
}
