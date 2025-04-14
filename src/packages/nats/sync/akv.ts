/*
Asynchronous Memory Efficient Access to Key:Value Store

This provides the same abstraction as dkv, except it doesn't download any
data to the client until you actually call get.   The calls to get and
set are thus async.

Because AsyncKV has no global knowledge of this key:value store, the inventory
is not updated and limits are not enforced.  Of course chunking (storing large
values properly) is supported.

There is no need to close this because it is stateless.

DEVELOPMENT:

~/cocalc/src/packages/backend$ node
> t =  require("@cocalc/backend/nats/sync").akv({name:'test'})

*/

import { GeneralKV } from "./general-kv";
import { getEnv } from "@cocalc/nats/client";
import { type DKVOptions, getPrefix } from "./dkv";
import { once } from "@cocalc/util/async-utils";
import { jsName } from "@cocalc/nats/names";
import { encodeBase64 } from "@cocalc/nats/util";

export class AKV<T = any> {
  private options: DKVOptions;
  private prefix: string;

  constructor(options: DKVOptions) {
    this.options = options;
    const { name, valueType = "json" } = options;
    this.prefix = getPrefix({
      name,
      valueType,
      options,
    });
  }

  private encodeKey = (key) => {
    if (typeof key != "string") {
      key = `${key}`;
    }
    return key ? `${this.prefix}.${encodeBase64(key)}` : this.prefix;
  };

  private getGeneralKVForOneKey = async (
    key: string,
    { noWatch }: { noWatch?: boolean } = {},
  ): Promise<GeneralKV<T>> => {
    const { valueType = "json", limits, account_id, project_id } = this.options;
    const filter = this.encodeKey(key);
    const kv = new GeneralKV<T>({
      name: jsName({ account_id, project_id }),
      env: await getEnv(),
      // IMPORTANT: need both filter and .> to get CHUNKS in case of chunked data!
      filter: [filter, filter + ".>"],
      limits,
      valueType,
      noWatch,
    });
    await kv.init();
    return kv;
  };

  // Just get one value asynchronously, rather than the entire dkv.
  // If the timeout option is given and the value of key is not set,
  // will wait until that many ms for the key to get
  get = async (key: string, { timeout }: { timeout?: number } = {}) => {
    const start = Date.now();
    const kv = await this.getGeneralKVForOneKey(key, { noWatch: !timeout });
    const filter = this.encodeKey(key);
    try {
      let value = kv.get(filter);
      if (!timeout) {
        return value;
      }
      while (value === undefined && Date.now() - start <= timeout) {
        try {
          await once(kv, "change", timeout - (Date.now() - start));
        } catch {
          // failed due to timeout -- result is undefined since key isn't set
          return undefined;
        }
        value = kv.get(filter);
      }
      return value;
    } finally {
      await kv.close();
    }
  };

  headers = async (key: string) => {
    const kv = await this.getGeneralKVForOneKey(key, { noWatch: true });
    const filter = this.encodeKey(key);
    const h = kv.headers(filter);
    await kv.close();
    return h;
  };

  time = async (key: string) => {
    const kv = await this.getGeneralKVForOneKey(key, { noWatch: true });
    const filter = this.encodeKey(key);
    const t = kv.time(filter);
    await kv.close();
    return t;
  };

  delete = async (key: string) => {
    const kv = await this.getGeneralKVForOneKey(key, { noWatch: true });
    const filter = this.encodeKey(key);
    await kv.delete(filter);
    await kv.close();
  };

  // NOTE: set does NOT update the inventory or apply limits, since this
  // has no global knowledge of the kv.
  set = async (
    key: string,
    value: T,
    options?: { headers?: { [key: string]: string } },
  ) => {
    const kv = await this.getGeneralKVForOneKey(key);
    const filter = this.encodeKey(key);
    await kv.set(filter, value, {
      headers: { ...options?.headers },
    });
  };
}

export function akv<T>(opts: DKVOptions) {
  return new AKV<T>(opts);
}
