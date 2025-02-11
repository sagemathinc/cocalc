/*
Always Consistent Centralized Key Value Store


DEVELOPMENT:

~/cocalc/src/packages/backend$ n
Welcome to Node.js v18.17.1.
Type ".help" for more information.
> t = await require("@cocalc/backend/nats/sync").dkv({name:'test'})


UNIT TESTS: See backend/nats/test/

They aren't right here, because this module doesn't have info to connect to NATS.
*/

import { EventEmitter } from "events";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { GeneralDKV, TOMBSTONE, type MergeFunction } from "./general-dkv";
import { userKvKey, type KVOptions } from "./kv";
import { jsName } from "@cocalc/nats/names";
import { sha1 } from "@cocalc/util/misc";

export interface DKVOptions extends KVOptions {
  merge: MergeFunction;
  noAutosave?: boolean;
}

export class DKV extends EventEmitter {
  generalDKV?: GeneralDKV;
  name: string;
  private prefix: string;
  private sha1;
  private opts;

  constructor({
    name,
    account_id,
    project_id,
    merge,
    env,
    noAutosave,
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
    this.opts = {
      name: kvname,
      filter: `${this.prefix}.>`,
      env,
      merge,
      noAutosave,
      limits,
    };

    this.init();
    return new Proxy(this, {
      deleteProperty(target, prop) {
        target.delete(prop);
        return true;
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
    if (this.generalDKV != null) {
      return;
    }
    // the merge conflict algorithm must be adapted since we encode
    // keys and values specially in this class.
    const merge = (opts) => {
      // here is what the input might look like:
      //   opts = {
      //   key: '71d7616250fed4dc27b70ee3b934178a3b196bbb.11f6ad8ec52a2984abaafd7c3b516503785c2072',
      //   remote: { key: 'x', value: 10 },
      //   local: { key: 'x', value: 5 },
      //   prev:  { key: 'x', value: 3 }
      //   }
      const key = opts.local?.key;
      if (key == null) {
        console.warn("BUG in merge conflict resolution", opts);
        throw Error("local key must be defined");
      }
      const local = opts.local.value;
      const remote = opts.remote?.value;
      const prev = opts.prev?.value;

      let value;
      try {
        value = this.opts.merge?.({ key, local, remote, prev }) ?? local;
      } catch (err) {
        console.warn("exception in merge conflict resolution", err);
        value = local;
      }
      //       console.log(
      //         "conflict resolution: ",
      //         { key, local, remote, prev },
      //         "-->",
      //         { value },
      //       );
      return { key, value };
    };
    this.generalDKV = new GeneralDKV({ ...this.opts, merge });
    this.generalDKV.on("change", ({ value, prev }) => {
      if (value != null && value !== TOMBSTONE) {
        this.emit("change", {
          key: value.key,
          value: value.value,
          prev: prev?.value,
        });
      } else if (prev != null) {
        // value is null so it's a delete
        this.emit("change", { key: prev.key, prev: prev.value });
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
    // @ts-ignore
    delete this.opts;
    this.emit("closed");
    this.removeAllListeners();
  };

  delete = (key) => {
    if (this.generalDKV == null) {
      throw Error("closed");
    }
    this.generalDKV.delete(`${this.prefix}.${this.sha1(key)}`);
  };

  clear = () => {
    this.generalDKV?.clear();
  };

  // server assigned time
  time = (key?: string) => {
    if (this.generalDKV == null) {
      throw Error("closed");
    }
    const times = this.generalDKV.time(
      key ? `${this.prefix}.${this.sha1(key)}` : undefined,
    );
    if (key != null || times == null) {
      return times;
    }
    const obj = this.generalDKV.get();
    const x: any = {};
    for (const k in obj) {
      const { key } = obj[k];
      x[key] = times[k];
    }
    return x;
  };

  has = (key: string) => {
    if (this.generalDKV == null) {
      throw Error("closed");
    }
    return this.generalDKV.has(`${this.prefix}.${this.sha1(key)}`);
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

  get length() {
    // not efficient?
    return Object.keys(this.get()).length;
  }

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

  save = async () => {
    await this.generalDKV?.save();
  };
}

const cache: { [key: string]: DKV } = {};
export const dkv = reuseInFlight(
  async (opts: DKVOptions, { noCache }: { noCache?: boolean } = {}) => {
    const f = async () => {
      const k = new DKV(opts);
      await k.init();
      return k;
    };
    if (noCache) {
      // especially useful for unit testing.
      return await f();
    }
    const key = userKvKey(opts);
    if (cache[key] == null) {
      const k = await f();
      k.on("closed", () => delete cache[key]);
      cache[key] = k;
    }
    return cache[key]!;
  },
  {
    createKey: (args) => userKvKey(args[0]) + JSON.stringify(args[1]),
  },
);
