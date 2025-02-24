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
import { jsName, localLocationName } from "@cocalc/nats/names";
import { sha1 } from "@cocalc/util/misc";
import refCache from "@cocalc/util/refcache";
import { getEnv } from "@cocalc/nats/client";
import { kvInventory, THROTTLE_MS } from "./inventory";
import { throttle } from "lodash";

export interface DKVOptions extends KVOptions {
  merge?: MergeFunction;
  noAutosave?: boolean;
  noInventory?: boolean;
}

export class DKV<T = any> extends EventEmitter {
  generalDKV?: GeneralDKV;
  name: string;
  private prefix: string;
  private sha1;
  private opts;

  constructor(options: DKVOptions) {
    super();
    const {
      name,
      account_id,
      project_id,
      merge,
      env,
      noAutosave,
      limits,
      noInventory,
    } = options;
    if (env == null) {
      throw Error("env must not be null");
    }
    if (noInventory || (process.env.COCALC_TEST_MODE && noInventory == null)) {
      // @ts-ignore
      this.updateInventory = () => {};
    }
    // name of the jetstream key:value store.
    const kvname = jsName({ account_id, project_id });
    this.name = name + localLocationName(options);
    this.sha1 = env.sha1 ?? sha1;
    this.prefix = this.sha1(this.name);
    this.opts = {
      location: { account_id, project_id },
      originalName: name,
      noInventory,
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
        if (typeof prop == "string") {
          target.delete(prop);
        }
        return true;
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

  delete = (key: string) => {
    if (this.generalDKV == null) {
      throw Error("closed");
    }
    this.generalDKV.delete(`${this.prefix}.${this.sha1(key)}`);
    this.updateInventory();
  };

  clear = () => {
    if (this.generalDKV == null) {
      throw Error("closed");
    }
    this.generalDKV.clear();
    this.updateInventory();
  };

  // server assigned time
  time = (key?: string): Date | undefined | { [key: string]: Date } => {
    if (this.generalDKV == null) {
      throw Error("closed");
    }
    const times = this.generalDKV.time(
      key ? `${this.prefix}.${this.sha1(key)}` : undefined,
    );
    if (key != null || times == null) {
      return times;
    }
    const obj = this.generalDKV.getAll();
    const x: any = {};
    for (const k in obj) {
      const { key } = obj[k];
      x[key] = times[k];
    }
    return x;
  };

  has = (key: string): boolean => {
    if (this.generalDKV == null) {
      throw Error("closed");
    }
    return this.generalDKV.has(`${this.prefix}.${this.sha1(key)}`);
  };

  get = (key: string): T | undefined => {
    if (this.generalDKV == null) {
      throw Error("closed");
    }
    return this.generalDKV.get(`${this.prefix}.${this.sha1(key)}`)?.value;
  };

  getAll = (): { [key: string]: T } => {
    if (this.generalDKV == null) {
      throw Error("closed");
    }
    const obj = this.generalDKV.getAll();
    const x: any = {};
    for (const k in obj) {
      const { key, value } = obj[k];
      x[key] = value;
    }
    return x;
  };

  get length(): number {
    if (this.generalDKV == null) {
      throw Error("closed");
    }
    return this.generalDKV.length;
  }

  set = (key: string, value: T): void => {
    if (this.generalDKV == null) {
      throw Error("closed");
    }
    if (value === undefined) {
      // undefined can't be JSON encoded, so we can't possibly represent it, and this
      // *must* be treated as a delete.
      // NOTE that jc.encode encodes null and undefined the same, so supporting this
      // as a value is just begging for misery.
      this.delete(key);
      return;
    }
    this.generalDKV.set(`${this.prefix}.${this.sha1(key)}`, { key, value });
    this.updateInventory();
  };

  hasUnsavedChanges = (): boolean => {
    if (this.generalDKV == null) {
      return false;
    }
    return this.generalDKV.hasUnsavedChanges();
  };

  unsavedChanges = (): T[] => {
    const generalDKV = this.generalDKV;
    if (generalDKV == null) {
      return [];
    }
    return generalDKV.unsavedChanges().map((key) => generalDKV.get(key)?.key);
  };

  save = async () => {
    return await this.generalDKV?.save();
  };

  private updateInventory = throttle(
    async () => {
      if (this.generalDKV == null || this.opts.noInventory) {
        return;
      }
      try {
        const inventory = await kvInventory(this.opts.location);
        const name = this.opts.originalName;
        if (!inventory.needsUpdate(name)) {
          return;
        }
        const stats = this.generalDKV.stats();
        if (stats == null) {
          return;
        }
        const { keys, bytes } = stats;
        inventory.set({ name, keys, bytes });
      } catch (err) {
        console.log(
          "WARNING: unable to update inventory for ",
          this.opts?.originalName,
          err,
        );
      }
    },
    THROTTLE_MS,
    { leading: false, trailing: true },
  );
}

export const cache = refCache<DKVOptions, DKV>({
  createKey: userKvKey,
  createObject: async (opts) => {
    if (opts.env == null) {
      opts.env = await getEnv();
    }
    const k = new DKV(opts);
    await k.init();
    return k;
  },
});

export async function dkv<T>(options: DKVOptions): Promise<DKV<T>> {
  return await cache(options);
}
