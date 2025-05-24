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

import * as persistClient from "@cocalc/conat/persist/client";
import { type DStreamOptions } from "./dstream";
import {
  type Headers,
  messageData,
  type Message,
} from "@cocalc/conat/core/client";
import { storagePath, type User } from "./core-stream";

export class AStream<T = any> {
  private storage: persistClient.Storage;
  private user: User;

  constructor(options: DStreamOptions) {
    this.user = {
      account_id: options.account_id,
      project_id: options.project_id,
    };
    this.storage = { path: storagePath(options) };
  }

  getMessage = async (
    seq: number,
    { timeout }: { timeout?: number } = {},
  ): Promise<Message<T> | undefined> => {
    return await persistClient.get({
      user: this.user,
      storage: this.storage,
      seq,
      timeout,
    });
  };

  get = async (
    seq: number,
    opts?: { timeout?: number },
  ): Promise<T | undefined> => {
    return (await this.getMessage(seq, opts))?.data;
  };

  delete = async (opts: {
    timeout?: number;
    seq?: number;
    last_seq?: number;
    all?: boolean;
  }): Promise<{ seqs: number[] }> => {
    return await persistClient.deleteMessages({
      user: this.user,
      storage: this.storage,
      ...opts,
    });
  };

  publish = async (
    value: T,
    options?: {
      headers?: Headers;
      previousSeq?: number;
      timeout?: number;
      // note: msgID is NOT supported because its lifetime is that of the stream object
      // on the server, which is likely immediately removed when using akv.  Of course
      // msgID is mainly for streams and not very relevant for kv.
    },
  ): Promise<{ seq: number; time: number }> => {
    return await persistClient.set({
      user: this.user,
      storage: this.storage,
      messageData: messageData(value, { headers: options?.headers }),
      previousSeq: options?.previousSeq,
      timeout: options?.timeout,
    });
  };

  push = async (...args: T[]): Promise<{ seqs: number[]; times: number[] }> => {
    const seqs: number[] = [];
    const times: number[] = [];
    for (const mesg of args) {
      const { seq, time } = await this.publish(mesg);
      seqs.push(seq);
      times.push(time);
    }
    return { seqs, times };
  };

  sqlite = async (
    statement: string,
    params?: any[],
    { timeout }: { timeout?: number } = {},
  ): Promise<any[]> => {
    return await persistClient.sqlite({
      user: this.user,
      storage: this.storage,
      timeout,
      statement,
      params,
    });
  };
}

export function astream<T>(opts: DStreamOptions) {
  return new AStream<T>(opts);
}
