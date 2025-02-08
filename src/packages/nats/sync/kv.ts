/*
Always Consistent Centralized Key Value Store


DEVELOPMENT:

~/cocalc/src/packages/backend n
Welcome to Node.js v18.17.1.
Type ".help" for more information.
> t = await require("@cocalc/backend/nats/sync").kv({name:'test'})

*/

import { EventEmitter } from "events";
import { type NatsEnv } from "@cocalc/nats/types";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { GeneralKV } from "./general-kv";
import { jsName } from "@cocalc/nats/names";

export interface KVOptions {
  name: string;
  account_id?: string;
  project_id?: string;
  env: NatsEnv;
}

export class KV extends EventEmitter {
  generalKV?: GeneralKV;
  name: string;

  constructor({ name, account_id, project_id, env }: KVOptions) {
    super();
    // name of the jetstream key:value store.
    const kvname = jsName({ account_id, project_id });
    this.name = name;
    this.generalKV = new GeneralKV({
      name: kvname,
      filter: `${name}.>`,
      env,
    });
    this.init();
    return new Proxy(this, {
      deleteProperty(target, prop) {
        target.delete(prop);
        return true;
      },
      set(target, prop, value) {
        prop = String(prop);
        if (prop == "_eventsCount") {
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

  delete = (key) => {
    if (this.generalKV == null) {
      throw Error("closed");
    }
    this.generalKV.delete(`${this.name}.${key}`);
  };

  get = (key?) => {
    if (this.generalKV == null) {
      throw Error("closed");
    }
    if (key == null) {
      const obj = this.generalKV.get();
      const x: any = {};
      for (const k in obj) {
        x[k.slice(this.name.length + 1)] = obj[k];
      }
      return x;
    } else {
      return this.generalKV.get(`${this.name}.${key}`);
    }
  };

  set = async (key: string, value: any) => {
    if (this.generalKV == null) {
      throw Error("closed");
    }
    await this.generalKV.set(`${this.name}.${key}`, value);
  };
}

export function userKvKey(options: KVOptions) {
  if (!options.name) {
    throw Error("name must be specified");
  }
  const { env, ...x } = options;
  return JSON.stringify(x);
}

const cache: { [key: string]: KV } = {};
export const kv = reuseInFlight(
  async (opts: KVOptions) => {
    const key = userKvKey(opts);
    if (cache[key] == null) {
      const k = new KV(opts);
      await k.init();
      k.on("closed", () => delete cache[key]);
      cache[key] = k;
    }
    return cache[key]!;
  },
  {
    createKey: (args) => userKvKey(args[0]),
  },
);
