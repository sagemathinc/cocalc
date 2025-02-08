/*
Always Consistent Centralized Key Value Store


DEVELOPMENT:

~/cocalc/src/packages/backend n
Welcome to Node.js v18.17.1.
Type ".help" for more information.
> t = await require("@cocalc/backend/nats/sync").dkv({name:'test'})

*/

import { EventEmitter } from "events";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { GeneralDKV, type MergeFunction } from "./general-dkv";
import { userKvKey, type KVOptions } from "./kv";
import { jsName } from "@cocalc/nats/names";

export interface DKVOptions extends KVOptions {
  merge: MergeFunction;
}

export class DKV extends EventEmitter {
  generalDKV?: GeneralDKV;
  name: string;

  constructor({ name, account_id, project_id, merge, env }: DKVOptions) {
    super();
    // name of the jetstream key:value store.
    const kvname = jsName({ account_id, project_id });
    this.name = name;
    this.generalDKV = new GeneralDKV({
      name: kvname,
      filter: `${name}.>`,
      env,
      merge,
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
    if (this.generalDKV == null) {
      throw Error("closed");
    }
    await this.generalDKV.init();
  });

  close = () => {
    if (this.generalDKV == null) {
      return;
    }
    this.generalDKV.close();
    delete this.generalDKV;
    this.emit("closed");
    this.removeAllListeners();
  };

  delete = (key) => {
    if (this.generalDKV == null) {
      throw Error("closed");
    }
    this.generalDKV.delete(`${this.name}.${key}`);
  };

  get = (key?) => {
    if (this.generalDKV == null) {
      throw Error("closed");
    }
    if (key == null) {
      const obj = this.generalDKV.get();
      const x: any = {};
      for (const k in obj) {
        x[k.slice(this.name.length + 1)] = obj[k];
      }
      return x;
    } else {
      return this.generalDKV.get(`${this.name}.${key}`);
    }
  };

  set = (key: string, value: any) => {
    if (this.generalDKV == null) {
      throw Error("closed");
    }
    this.generalDKV.set(`${this.name}.${key}`, value);
  };
}

const cache: { [key: string]: DKV } = {};
export const dkv = reuseInFlight(
  async (opts: DKVOptions) => {
    const key = userKvKey(opts);
    if (cache[key] == null) {
      const k = new DKV(opts);
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
