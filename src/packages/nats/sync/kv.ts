/*
Always Consistent Centralized Key Value Store

NOTE: I think this isn't used by anything actually.  Note it doesn't emit
change events.    Maybe we should delete this.

DEVELOPMENT:

~/cocalc/src/packages/backend$ n
Welcome to Node.js v18.17.1.
Type ".help" for more information.
> t = await require("@cocalc/backend/nats/sync").kv({name:'test'})

*/

import { EventEmitter } from "events";
import { type NatsEnv } from "@cocalc/nats/types";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { GeneralKV, type KVLimits } from "./general-kv";
import { jsName } from "@cocalc/nats/names";
import { sha1 } from "@cocalc/util/misc";
import refCache from "@cocalc/util/refcache";

export interface KVOptions {
  name: string;
  account_id?: string;
  project_id?: string;
  env: NatsEnv;
  limits?: Partial<KVLimits>;
  noCache?: boolean;
}

export class KV<T = any> extends EventEmitter {
  generalKV?: GeneralKV<{ key: string; value: T }>;
  name: string;
  private prefix: string;
  private sha1;

  constructor({ name, account_id, project_id, env, limits }: KVOptions) {
    super();
    // name of the jetstream key:value store.
    const kvname = jsName({ account_id, project_id });
    this.name = name;
    this.sha1 = env.sha1 ?? sha1;
    this.prefix = this.sha1(name);
    this.generalKV = new GeneralKV({
      name: kvname,
      filter: `${this.prefix}.>`,
      env,
      limits,
    });
    this.init();
    return new Proxy(this, {
      deleteProperty(target, prop) {
        if (typeof prop == "string") {
          target.delete(prop);
          return true;
        } else {
          return false;
        }
      },
      set(target, prop, value) {
        prop = String(prop);
        if (prop == "_eventsCount" || prop == "_events") {
          target[prop] = value;
          return true;
        }
        if (target[prop] != null) {
          throw Error(`method name '${prop}' is read only`);
        }
        target.set(prop, value);
        return true;
      },
      get(target, prop) {
        return target[String(prop)] ?? target.get(String(prop));
      },
    });
  }

  init = reuseInFlight(async () => {
    if (this.generalKV == null) {
      throw Error("closed");
    }
    await this.generalKV.init();
  });

  close = () => {
    if (this.generalKV == null) {
      return;
    }
    this.generalKV.close();
    delete this.generalKV;
    this.emit("closed");
    this.removeAllListeners();
  };

  delete = async (key: string) => {
    if (this.generalKV == null) {
      throw Error("closed");
    }
    await this.generalKV.delete(`${this.prefix}.${this.sha1(key)}`);
  };

  // delete everything
  clear = async () => {
    if (this.generalKV == null) {
      throw Error("closed");
    }
    await this.generalKV.clear();
  };

  // server assigned time
  time = (key?: string): { [key: string]: Date } | Date | undefined => {
    if (this.generalKV == null) {
      throw Error("closed");
    }
    return this.generalKV.time(
      key ? `${this.prefix}.${this.sha1(key)}` : undefined,
    );
  };

  get = (key: string): T | undefined => {
    if (this.generalKV == null) {
      throw Error("closed");
    }
    return this.generalKV.get(`${this.prefix}.${this.sha1(key)}`)?.value;
  };

  getAll = (): { [key: string]: T } => {
    if (this.generalKV == null) {
      throw Error("closed");
    }
    const obj = this.generalKV.getAll();
    const x: any = {};
    for (const k in obj) {
      const { key, value } = obj[k];
      x[key] = value;
    }
    return x;
  };

  set = async (key: string, value: T) => {
    if (this.generalKV == null) {
      throw Error("closed");
    }
    await this.generalKV.set(`${this.prefix}.${this.sha1(key)}`, {
      key,
      value,
    });
  };
}

export function userKvKey(options: KVOptions) {
  if (!options.name) {
    throw Error("name must be specified");
  }
  const { env, ...x } = options;
  return JSON.stringify(x);
}

export const cache = refCache<KVOptions, KV>({
  createKey: userKvKey,
  createObject: async (opts) => {
    const k = new KV(opts);
    await k.init();
    return k;
  },
});

export async function kv<T>(options: KVOptions): Promise<KV<T>> {
  return await cache(options);
}
