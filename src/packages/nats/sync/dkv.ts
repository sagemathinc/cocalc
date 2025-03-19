/*
Always Consistent Centralized Key Value Store


DEVELOPMENT:

From node.js

    ~/cocalc/src/packages/backend$ n
    Welcome to Node.js v18.17.1.
    Type ".help" for more information.
    > t = await require("@cocalc/backend/nats/sync").dkv({name:'test'})

From the browser:

If you want a persistent distributed key:value store in the browser,
which shares state to all browser clients for a given **account_id**,
do this in the dev console:

    > a = await cc.client.nats_client.dkv({name:'test', account_id:cc.client.account_id})

Then do the same thing in another dev console in another browser window:

    > a = await cc.client.nats_client.dkv({name:'test', account_id:cc.client.account_id})

Now do this in one:

    > a.x = 10

and

    > a.x
    10

in the other.  Yes, it's that easy to have a persistent distributed eventually consistent
synchronized key-value store!

For library code, replace cc.client by webapp_client, which you get via:

    import { webapp_client } from "@cocalc/frontend/webapp-client"

If instead you need to share state with a project (or compute server), use

> b = await cc.client.nats_client.dkv({name:'test', project_id:'...'})


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
import { inventory, THROTTLE_MS } from "./inventory";
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
  private keys: { [encodedKey: string]: string } = {};

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
      desc,
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
      desc,
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
    // the key in the header.
    const merge = (opts) => {
      // here is what the input might look like:
      //   opts = {
      //   key: '71d7616250fed4dc27b70ee3b934178a3b196bbb.11f6ad8ec52a2984abaafd7c3b516503785c2072',
      //   remote: { key: 'x', value: 10 },
      //   local: { key: 'x', value: 5 },
      //   prev:  { key: 'x', value: 3 }
      //   }
      const key = this.getKey(opts.key);
      if (key == null) {
        console.warn("BUG in merge conflict resolution", opts);
        throw Error("local key must be defined");
      }
      const { local, remote, prev } = opts;
      try {
        return this.opts.merge?.({ key, local, remote, prev }) ?? local;
      } catch (err) {
        console.warn("exception in merge conflict resolution", err);
        return local;
      }
    };
    this.generalDKV = new GeneralDKV({ ...this.opts, merge });
    this.generalDKV.on("change", ({ key, value, prev }) => {
      if (value !== undefined && value !== TOMBSTONE) {
        this.emit("change", {
          key: this.getKey(key),
          value,
          prev,
        });
      } else {
        // value is undefined or TOMBSTONE, so it's a delete, so do not set value here
        this.emit("change", { key: this.getKey(key), prev });
      }
    });
    this.generalDKV.on("reject", ({ key, value }) => {
      if (value != null) {
        this.emit("reject", { key: this.getKey(key), value });
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
    return this.generalDKV.get(`${this.prefix}.${this.sha1(key)}`);
  };

  getAll = (): { [key: string]: T } => {
    if (this.generalDKV == null) {
      throw Error("closed");
    }
    const obj = this.generalDKV.getAll();
    const x: any = {};
    for (const k in obj) {
      const key = this.getKey(k);
      x[key] = obj[k];
    }
    return x;
  };

  private getKey = (k) => {
    if (this.keys[k] != null) {
      return this.keys[k];
    }
    const h = this.generalDKV?.headers(k);
    if (h?.key == null) {
      console.warn("headers = ", h);
      throw Error(`missing header for key '${k}'`);
    }
    return atob(h.key);
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
    const encodedKey = `${this.prefix}.${this.sha1(key)}`;
    this.keys[encodedKey] = key;
    this.generalDKV.set(encodedKey, value, {
      headers: { key: btoa(key) },
    });
    this.updateInventory();
  };

  hasUnsavedChanges = (): boolean => {
    if (this.generalDKV == null) {
      return false;
    }
    return this.generalDKV.hasUnsavedChanges();
  };

  unsavedChanges = (): string[] => {
    const generalDKV = this.generalDKV;
    if (generalDKV == null) {
      return [];
    }
    return generalDKV.unsavedChanges().map((key) => this.getKey(key));
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
        const inv = await inventory(this.opts.location);
        const name = this.opts.originalName;
        if (!inv.needsUpdate({ name, type: "kv" })) {
          return;
        }
        const stats = this.generalDKV.stats();
        if (stats == null) {
          return;
        }
        const { count, bytes } = stats;
        inv.set({ type: "kv", name, count, bytes, desc: this.opts.desc });
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
