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
import { sha1 } from "@cocalc/util/misc";

export interface DKVOptions extends KVOptions {
  merge: MergeFunction;
}

export class DKV extends EventEmitter {
  generalDKV?: GeneralDKV;
  name: string;
  private prefix: string;
  private sha1;

  constructor({
    name,
    account_id,
    project_id,
    merge,
    env,
    limits,
  }: DKVOptions) {
    super();
    if (env == null) {
      throw Error("env must not be null");
    }
    // name of the jetstream key:value store.
    const kvname = jsName({ account_id, project_id });
    this.name = name;
    this.sha1 = env.sha1 ?? sha1;
    this.prefix = this.sha1(name);
    this.generalDKV = new GeneralDKV({
      name: kvname,
      filter: `${this.prefix}.>`,
      env,
      merge,
      limits,
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
    this.generalDKV.on("change", ({ value, prev }) => {
      if (value != null) {
        this.emit("change", { key: value.key, value: value.value });
      } else if (prev != null) {
        // value is null so it's a delete
        this.emit("change", { key: prev.key });
      }
    });
    this.generalDKV.on("reject", ({ value }) => {
      if (value != null) {
        this.emit("reject", { key: value.key, value: value.value });
      }
    });
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
    this.generalDKV.delete(`${this.prefix}.${this.sha1(key)}`);
  };

  get = (key?) => {
    if (this.generalDKV == null) {
      throw Error("closed");
    }
    if (key == null) {
      const obj = this.generalDKV.get();
      const x: any = {};
      for (const k in obj) {
        const { key, value } = obj[k];
        x[key] = value;
      }
      return x;
    } else {
      return this.generalDKV.get(`${this.prefix}.${this.sha1(key)}`)?.value;
    }
  };

  set = (key: string, value: any) => {
    if (this.generalDKV == null) {
      throw Error("closed");
    }
    this.generalDKV.set(`${this.prefix}.${this.sha1(key)}`, { key, value });
  };

  hasUnsavedChanges = () => {
    if (this.generalDKV == null) {
      return false;
    }
    return this.generalDKV.hasUnsavedChanges();
  };

  unsavedChanges = () => {
    const generalDKV = this.generalDKV;
    if (generalDKV == null) {
      return [];
    }
    return generalDKV.unsavedChanges().map((key) => generalDKV.get(key)?.key);
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
