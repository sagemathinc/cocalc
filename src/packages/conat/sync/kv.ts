/*
Async Consistent Centralized Key Value Store

NOTE: I think this isn't used by anything actually.  Note it doesn't emit
change events.    Maybe we should delete this?

DEVELOPMENT:

~/cocalc/src/packages/backend$ n
Welcome to Node.js v18.17.1.
Type ".help" for more information.
> t = await require("@cocalc/backend/conat/sync").kv({name:'test'})

*/

import { EventEmitter } from "events";
import { type NatsEnv, type Location } from "@cocalc/conat/types";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { GeneralKV, type KVLimits } from "./general-kv";
import { jsName, localLocationName } from "@cocalc/conat/names";
import refCache from "@cocalc/util/refcache";
import { getEnv } from "@cocalc/conat/client";
import type { JSONValue } from "@cocalc/util/types";
import type { ValueType } from "@cocalc/conat/types";
import { decodeBase64, encodeBase64 } from "@cocalc/conat/util";
import jsonStableStringify from "json-stable-stringify";

export interface KVOptions extends Location {
  name: string;
  env?: NatsEnv;
  limits?: Partial<KVLimits>;
  noCache?: boolean;
  desc?: JSONValue;
  valueType?: ValueType;
}

export class KV<T = any> extends EventEmitter {
  generalKV?: GeneralKV<T>;
  name: string;
  private prefix: string;

  constructor(options: KVOptions) {
    super();
    const { name, account_id, project_id, env, limits, valueType } = options;
    // name of the jetstream key:value store.
    const kvname = jsName({ account_id, project_id });
    this.name = name + localLocationName(options);
    if (env == null) {
      throw Error("env must be defined");
    }
    this.prefix = encodeBase64(this.name);
    this.generalKV = new GeneralKV({
      name: kvname,
      filter: `${this.prefix}.>`,
      env,
      limits,
      valueType,
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
        if (prop == "_eventsCount" || prop == "_events" || prop == "close") {
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
    await this.generalKV.delete(`${this.prefix}.${encodeBase64(key)}`);
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
      key ? `${this.prefix}.${encodeBase64(key)}` : undefined,
    );
  };

  get = (key: string): T | undefined => {
    if (this.generalKV == null) {
      throw Error("closed");
    }
    return this.generalKV.get(`${this.prefix}.${encodeBase64(key)}`);
  };

  getAll = (): { [key: string]: T } => {
    if (this.generalKV == null) {
      throw Error("closed");
    }
    const obj = this.generalKV.getAll();
    const x: any = {};
    for (const k in obj) {
      const h = this.generalKV.headers(k);
      if (h?.key == null) {
        throw Error(`missing header for key ${k}`);
      }
      const key = decodeBase64(h.key);
      x[key] = obj[k];
    }
    return x;
  };

  set = async (key: string, value: T) => {
    if (this.generalKV == null) {
      throw Error("closed");
    }
    await this.generalKV.set(`${this.prefix}.${encodeBase64(key)}`, value, {
      headers: { key: encodeBase64(key) },
    });
  };
}

export function userKvKey(options: KVOptions) {
  if (!options.name) {
    throw Error("name must be specified");
  }
  const { env, ...x } = options;
  return jsonStableStringify(x);
}

export const cache = refCache<KVOptions, KV>({
  name: "kv",
  createKey: userKvKey,
  createObject: async (opts) => {
    if (opts.env == null) {
      opts.env = await getEnv();
    }
    const k = new KV(opts);
    await k.init();
    return k;
  },
});

export async function kv<T>(options: KVOptions): Promise<KV<T>> {
  return await cache(options);
}
