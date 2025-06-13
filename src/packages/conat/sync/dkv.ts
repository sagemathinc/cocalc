/*
Eventually Consistent Distributed Key:Value Store

- You give one subject and general-dkv provides a synchronous eventually consistent
  "multimaster" distributed way to work with the KV store of keys matching that subject,
  inside of the named KV store.

- You may define a 3-way merge function, which is used to automatically resolve all
  conflicting writes.   The default is to use our local version, i.e., "last write
  to remote wins".  The function is run locally so can have access to any state.

- All set/get/delete operations are synchronous.

- The state gets sync'd in the backend to persistent storage on Conat as soon as possible,
  and there is an async save function.

This class is based on top of the Consistent Centralized Key:Value Store defined in kv.ts.
You can use the same key:value store at the same time via both interfaces, and if the store
is a DKV, you can also access the underlying KV via "store.kv".

- You must explicitly call "await store.init()" to initialize this before using it.

- The store emits an event ('change', key) whenever anything changes.

- Calling "store.getAll()" provides ALL the data, and "store.get(key)" gets one value.

- Use "store.set(key,value)" or "store.set({key:value, key2:value2, ...})" to set data,
  with the following semantics:

  - in the background, changes propagate to Conat.  You do not do anything explicitly and
    this should never raise an exception.

  - you can call "store.hasUnsavedChanges()" to see if there are any unsaved changes.

  - call "store.unsavedChanges()" to see the unsaved keys.

- The 3-way merge function takes as input {local,remote,prev,key}, where
    - key = the key where there's a conflict
    - local = your version of the value
    - remote = the remote value, which conflicts in that isEqual(local,remote) is false.
    - prev = a known common prev of local and remote.

    (any of local, remote or prev can be undefined, e.g., no previous value or a key was deleted)

  You can do anything synchronously you want to resolve such conflicts, i.e., there are no
  axioms that have to be satisifed.  If the 3-way merge function throws an exception (or is
  not specified) we silently fall back to "last write wins".


DEVELOPMENT:

~/cocalc/src/packages/backend$ node

s = await require("@cocalc/backend/conat/sync").dkv({name:'test', merge:({local,remote})=>{return {...remote,...local}}});


In the browser console:

> s = await cc.client.conat_client.dkv({filter:['foo.>'],merge:({local,remote})=>{return {...remote,...local}}})

# NOTE that the name is account-{account_id} or project-{project_id},
# and if not given defaults to the account-{user's account id}
> s.kv.name
'account-6aae57c6-08f1-4bb5-848b-3ceb53e61ede'

> s.on('change',(key)=>console.log(key));0;

*/

import { EventEmitter } from "events";
import {
  CoreStream,
  type Configuration,
  type ChangeEvent,
} from "./core-stream";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { isEqual } from "lodash";
import { delay, map as awaitMap } from "awaiting";
import {
  type Client,
  ConatError,
  type Headers,
} from "@cocalc/conat/core/client";
import refCache from "@cocalc/util/refcache";
import { type JSONValue } from "@cocalc/util/types";
import { conat } from "@cocalc/conat/client";
import { asyncThrottle, until } from "@cocalc/util/async-utils";
import {
  inventory,
  type Inventory,
  INVENTORY_UPDATE_INTERVAL,
} from "./inventory";

export const TOMBSTONE = Symbol("tombstone");
const MAX_PARALLEL = 250;

const DEBUG = false;

export type MergeFunction = (opts: {
  key: string;
  prev: any;
  local: any;
  remote: any;
}) => any;

interface SetOptions {
  headers?: Headers;
}

export interface DKVOptions {
  name: string;
  account_id?: string;
  project_id?: string;
  desc?: JSONValue;
  client?: Client;
  // 3-way merge conflict resolution
  merge?: (opts: { key: string; prev?: any; local?: any; remote?: any }) => any;
  config?: Partial<Configuration>;

  // if noAutosave is set, local changes are never saved until you explicitly
  // call "await this.save()", which will try once to save.  Changes made during
  // the save may not be saved though.
  // CAUTION: noAutosave is really  only meant for unit testing!  The save is
  // reuseInFlighted so a safe somewhere far away could be in progress starting
  // before your call to save, and when it finishes that's it, so what you just
  // did is not saved.  Take care.
  noAutosave?: boolean;

  ephemeral?: boolean;

  noCache?: boolean;
  noInventory?: boolean;
}

export class DKV<T = any> extends EventEmitter {
  private kv?: CoreStream<T>;
  private merge?: MergeFunction;
  private local: { [key: string]: T | typeof TOMBSTONE } = {};
  private options: { [key: string]: SetOptions } = {};
  private saved: { [key: string]: T | typeof TOMBSTONE } = {};
  private changed: Set<string> = new Set();
  private noAutosave: boolean;
  public readonly name: string;
  public readonly desc?: JSONValue;
  private saveErrors: boolean = false;
  private invalidSeq = new Set<number>();
  private opts: DKVOptions;

  constructor(opts: DKVOptions) {
    super();
    if (opts.client == null) {
      throw Error("client must be specified");
    }
    this.opts = opts;
    const {
      name,
      project_id,
      account_id,
      desc,
      client,
      merge,
      config,
      noAutosave,
      ephemeral = false,
    } = opts;
    this.name = name;
    this.desc = desc;
    this.merge = merge;
    this.noAutosave = !!noAutosave;
    this.kv = new CoreStream({
      name,
      project_id,
      account_id,
      client,
      config,
      ephemeral,
    });

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

  private initialized = false;
  init = async () => {
    if (this.initialized) {
      throw Error("init can only be called once");
    }
    this.initialized = true;
    if (this.kv == null) {
      throw Error("closed");
    }
    this.kv.on("change", this.handleRemoteChange);
    await this.kv.init();
    // allow_msg_ttl is used for deleting tombstones.
    await this.kv.config({ allow_msg_ttl: true });
    this.emit("connected");
  };

  isClosed = () => {
    return this.kv == null;
  };

  close = () => {
    if (this.isClosed()) {
      return;
    }
    const kv = this.kv;
    delete this.kv;
    if (kv != null) {
      kv.removeListener("change", this.handleRemoteChange);
      kv.close();
    }
    this.emit("closed");
    this.removeAllListeners();
    // @ts-ignore
    delete this.local;
    // @ts-ignore
    delete this.options;
    // @ts-ignore
    delete this.changed;
    delete this.merge;
    // @ts-ignore
    delete this.opts;
  };

  private discardLocalState = (key: string) => {
    delete this.local[key];
    delete this.options[key];
    delete this.saved[key];
    if (this.isStable()) {
      this.emit("stable");
    }
  };

  // stable = everything is saved *and* also echoed back from the server as confirmation.
  isStable = () => {
    for (const _ in this.local) {
      return false;
    }
    return true;
  };

  private handleRemoteChange = ({
    mesg: remote,
    key,
    prev,
  }: ChangeEvent<T>) => {
    if (key === undefined) {
      // not part of kv store data
      return;
    }
    const local = this.local[key] === TOMBSTONE ? undefined : this.local[key];
    let value: any = remote;
    if (local !== undefined) {
      // we have an unsaved local value, so let's check to see if there is a
      // conflict or not.
      if (isEqual(local, remote)) {
        // incoming remote value is equal to unsaved local value, so we can
        // just discard our local value (no need to save it).
        this.discardLocalState(key);
      } else {
        // There is a conflict.  Let's resolve the conflict:
        // console.log("merge conflict", { key, remote, local, prev });
        try {
          value = this.merge?.({ key, local, remote, prev }) ?? local;
          // console.log("merge conflict --> ", value);
          //           console.log("handle merge conflict", {
          //             key,
          //             local,
          //             remote,
          //             prev,
          //             value,
          //           });
        } catch (err) {
          console.warn("exception in merge conflict resolution", err);
          // user provided a merge function that throws an exception. We select local, since
          // it is the newest, i.e., "last write wins"
          value = local;
          // console.log("merge conflict ERROR --> ", err, value);
        }
        if (isEqual(value, remote)) {
          // no change, so forget our local value
          this.discardLocalState(key);
        } else {
          // resolve with the new value, or if it is undefined, a TOMBSTONE,
          // meaning choice is to delete.
          // console.log("conflict resolution: ", { key, value });
          if (value === TOMBSTONE) {
            this.delete(key);
          } else {
            this.set(key, value);
          }
        }
      }
    }
    this.emit("change", { key, value, prev });
  };

  get(key: string): T | undefined;
  get(): { [key: string]: T };
  get(key?: string): T | { [key: string]: T } | undefined {
    if (this.kv == null) {
      throw Error("closed");
    }
    if (key === undefined) {
      return this.getAll();
    }
    const local = this.local[key];
    if (local === TOMBSTONE) {
      return undefined;
    }
    if (local !== undefined) {
      return local;
    }
    return this.kv.getKv(key);
  }

  get length(): number {
    // not efficient
    return Object.keys(this.getAll()).length;
  }

  getAll = (): { [key: string]: T } => {
    if (this.kv == null) {
      throw Error("closed");
    }
    const x = { ...this.kv.getAllKv(), ...this.local };
    for (const key in this.local) {
      if (this.local[key] === TOMBSTONE) {
        delete x[key];
      }
    }
    return x as { [key: string]: T };
  };

  keys = (): string[] => {
    return Object.keys(this.getAll());
  };

  has = (key: string): boolean => {
    if (this.kv == null) {
      throw Error("closed");
    }
    const a = this.local[key];
    if (a === TOMBSTONE) {
      return false;
    }
    if (a !== undefined) {
      return true;
    }
    return this.kv.hasKv(key);
  };

  time = (key?: string): { [key: string]: Date } | Date | undefined => {
    if (this.kv == null) {
      throw Error("closed");
    }
    return this.kv.timeKv(key);
  };

  seq = (key: string): number | undefined => {
    if (this.kv == null) {
      throw Error("closed");
    }
    return this.kv.seqKv(key);
  };

  private _delete = (key) => {
    this.local[key] = TOMBSTONE;
    this.changed.add(key);
  };

  delete = (key) => {
    this._delete(key);
    if (!this.noAutosave) {
      this.save();
    }
  };

  clear = () => {
    if (this.kv == null) {
      throw Error("closed");
    }
    for (const key in this.kv.getAllKv()) {
      this._delete(key);
    }
    for (const key in this.local) {
      this._delete(key);
    }
    if (!this.noAutosave) {
      this.save();
    }
  };

  private toValue = (obj) => {
    if (obj === undefined) {
      return TOMBSTONE;
    }
    return obj;
  };

  headers = (key: string): Headers | undefined => {
    if (this.options[key] != null) {
      return this.options[key]?.headers;
    } else {
      return this.kv?.headersKv(key);
    }
  };

  set = (key: string, value: T, options?: SetOptions) => {
    const obj = this.toValue(value);
    this.local[key] = obj;
    if (options != null) {
      this.options[key] = options;
    }
    this.changed.add(key);
    if (!this.noAutosave) {
      this.save();
    }
    this.updateInventory();
  };

  setMany = (obj) => {
    for (const key in obj) {
      this.local[key] = this.toValue(obj[key]);
      this.changed.add(key);
    }
    if (!this.noAutosave) {
      this.save();
    }
    this.updateInventory();
  };

  hasUnsavedChanges = () => {
    if (this.kv == null) {
      return false;
    }
    return this.unsavedChanges().length > 0;
  };

  unsavedChanges = (): string[] => {
    return Object.keys(this.local).filter(
      (key) => this.local[key] !== this.saved[key],
    );
  };

  save = reuseInFlight(async () => {
    if (this.noAutosave) {
      return await this.attemptToSave();
    }
    let status;

    await until(
      async () => {
        if (this.kv == null) {
          return true;
        }
        try {
          status = await this.attemptToSave();
          //console.log("successfully saved");
        } catch (err) {
          if (!process.env.COCALC_TEST_MODE) {
            console.log(
              "WARNING: dkv attemptToSave failed -- ",
              this.name,
              this.kv?.name,
              err,
            );
          }
        }
        return !this.hasUnsavedChanges();
      },
      { start: 150, decay: 1.3, max: 10000 },
    );
    return status;
  });

  private attemptToSave = async () => {
    if (true) {
      await this.attemptToSaveMany();
    } else {
      await this.attemptToSaveParallel();
    }
  };

  private attemptToSaveMany = reuseInFlight(async () => {
    let start = Date.now();
    if (DEBUG) {
      console.log("attemptToSaveMany: start");
    }
    if (this.kv == null) {
      throw Error("closed");
    }
    this.changed.clear();
    const status = { unsaved: 0, set: 0, delete: 0 };
    const obj = { ...this.local };
    for (const key in obj) {
      if (obj[key] === TOMBSTONE) {
        status.unsaved += 1;
        await this.kv.deleteKv(key);
        if (this.kv == null) return;
        status.delete += 1;
        status.unsaved -= 1;
        delete obj[key];
        if (!this.changed.has(key)) {
          // successfully saved this and user didn't make a change *during* the set
          this.discardLocalState(key);
        }
      }
    }
    let errors = false;
    const x: {
      key: string;
      mesg: T;
      options?: {
        headers?: Headers;
        previousSeq?: number;
      };
    }[] = [];
    for (const key in obj) {
      const previousSeq = this.merge != null ? this.seq(key) : undefined;
      if (previousSeq && this.invalidSeq.has(previousSeq)) {
        continue;
      }
      status.unsaved += 1;
      x.push({
        key,
        mesg: obj[key] as T,
        options: {
          ...this.options[key],
          previousSeq,
        },
      });
    }
    const results = await this.kv.setKvMany(x);

    let i = 0;
    for (const resp of results) {
      const { key } = x[i];
      i++;
      if (this.kv == null) return;
      if (!(resp as any).error) {
        status.unsaved -= 1;
        status.set += 1;
      } else {
        const { code, error } = resp as any;
        if (DEBUG) {
          console.log("kv store -- attemptToSave failed", this.desc, error, {
            key,
            value: obj[key],
            code: code,
          });
        }
        errors = true;
        if (code == "reject") {
          const value = this.local[key];
          // can never save this.
          this.discardLocalState(key);
          status.unsaved -= 1;
          this.emit("reject", { key, value });
        }
        if (code == "wrong-last-sequence") {
          // This happens when another client has published a NEWER version of this key,
          // so the right thing is to just ignore this.  In a moment there will be no
          // need to save anything, since we'll receive a message that overwrites this key.
          // It's very important that the changefeed actually be working, of course, which
          // is why the this.invalidSeq, so we never retry in this case, since it can't work.
          if (x[i]?.options?.previousSeq) {
            this.invalidSeq.add(x[i].options!.previousSeq!);
          }
          return;
        }
        if (code == 408) {
          // timeout -- expected to happen periodically, of course
          if (!process.env.COCALC_TEST_MODE) {
            console.log("WARNING: timeout saving (will try again soon)");
          }
          return;
        }
        if (!process.env.COCALC_TEST_MODE) {
          console.warn(
            `WARNING: unexpected error saving dkv '${this.name}' -- ${error}`,
          );
        }
      }
    }
    if (errors) {
      this.saveErrors = true;
      throw Error(`there were errors saving dkv '${this.name}'`);
      // so it retries
    } else {
      if (
        !process.env.COCALC_TEST_MODE &&
        this.saveErrors &&
        status.unsaved == 0
      ) {
        this.saveErrors = false;
        console.log(`SUCCESS: dkv ${this.name} fully saved`);
      }
    }
    if (DEBUG) {
      console.log("attemptToSaveMany: done", Date.now() - start);
    }

    return status;
  });

  attemptToSaveParallel = reuseInFlight(async () => {
    let start = Date.now();
    if (DEBUG) {
      console.log("attemptToSaveParallel: start");
    }
    if (this.kv == null) {
      throw Error("closed");
    }
    this.changed.clear();
    const status = { unsaved: 0, set: 0, delete: 0 };
    const obj = { ...this.local };
    for (const key in obj) {
      if (obj[key] === TOMBSTONE) {
        status.unsaved += 1;
        await this.kv.deleteKv(key);
        if (this.kv == null) return;
        status.delete += 1;
        status.unsaved -= 1;
        delete obj[key];
        if (!this.changed.has(key)) {
          // successfully saved this and user didn't make a change *during* the set
          this.discardLocalState(key);
        }
      }
    }
    let errors = false;
    const f = async (key: string) => {
      if (this.kv == null) {
        // closed
        return;
      }
      const previousSeq = this.merge != null ? this.seq(key) : undefined;
      try {
        if (previousSeq && this.invalidSeq.has(previousSeq)) {
          throw new ConatError("waiting on new sequence via changefeed", {
            code: "wrong-last-sequence",
          });
        }
        status.unsaved += 1;
        await this.kv.setKv(key, obj[key] as T, {
          ...this.options[key],
          previousSeq,
        });
        if (this.kv == null) return;
        if (DEBUG) {
          console.log("kv store -- attemptToSave succeed", this.desc, {
            key,
            value: obj[key],
          });
        }
        status.unsaved -= 1;
        status.set += 1;
        // note that we CANNOT call  this.discardLocalState(key) here, because
        // this.get(key) needs to work immediately after save, but if this.local[key]
        // is deleted, then this.get(key) would be undefined, because
        // this.kv.getKv(key) only has value in it once the value is
        // echoed back from the server.
      } catch (err) {
        if (DEBUG) {
          console.log("kv store -- attemptToSave failed", this.desc, err, {
            key,
            value: obj[key],
            code: err.code,
          });
        }
        errors = true;
        if (err.code == "reject") {
          const value = this.local[key];
          // can never save this.
          this.discardLocalState(key);
          status.unsaved -= 1;
          this.emit("reject", { key, value });
        }
        if (err.code == "wrong-last-sequence") {
          // This happens when another client has published a NEWER version of this key,
          // so the right thing is to just ignore this.  In a moment there will be no
          // need to save anything, since we'll receive a message that overwrites this key.
          // It's very important that the changefeed actually be working, of course, which
          // is why the this.invalidSeq, so we never retry in this case, since it can't work.
          if (previousSeq) {
            this.invalidSeq.add(previousSeq);
          }
          return;
        }
        if (err.code == 408) {
          // timeout -- expected to happen periodically, of course
          if (!process.env.COCALC_TEST_MODE) {
            console.log("WARNING: timeout saving (will try again soon)");
          }
          return;
        }
        if (!process.env.COCALC_TEST_MODE) {
          console.warn(
            `WARNING: unexpected error saving dkv '${this.name}' -- ${err}`,
          );
        }
      }
    };
    await awaitMap(Object.keys(obj), MAX_PARALLEL, f);
    if (errors) {
      this.saveErrors = true;
      throw Error(`there were errors saving dkv '${this.name}'`);
      // so it retries
    } else {
      if (
        !process.env.COCALC_TEST_MODE &&
        this.saveErrors &&
        status.unsaved == 0
      ) {
        this.saveErrors = false;
        console.log(`SUCCESS: dkv ${this.name} fully saved`);
      }
    }
    if (DEBUG) {
      console.log("attemptToSaveParallel: done", Date.now() - start);
    }

    return status;
  });

  stats = () => this.kv?.stats();

  // get or set config
  config = async (
    config: Partial<Configuration> = {},
  ): Promise<Configuration> => {
    if (this.kv == null) {
      throw Error("not initialized");
    }
    return await this.kv.config(config);
  };

  private updateInventory = asyncThrottle(
    async () => {
      if (this.opts == null || this.opts.noInventory) {
        return;
      }
      await delay(500);
      if (this.isClosed() || this.kv == null) {
        return;
      }
      let inv: Inventory | undefined = undefined;
      try {
        const { account_id, project_id, desc } = this.opts;
        const inv = await inventory({ account_id, project_id });
        if (this.isClosed()) {
          return;
        }
        const status = {
          type: "kv" as "kv",
          name: this.opts.name,
          desc,
          ...(await this.kv.inventory()),
        };
        inv.set(status);
      } catch (err) {
        if (!process.env.COCALC_TEST_MODE) {
          console.log(
            `WARNING: unable to update inventory.  name='${this.opts.name} -- ${err}'`,
          );
        }
      } finally {
        // @ts-ignore
        inv?.close();
      }
    },
    INVENTORY_UPDATE_INTERVAL,
    { leading: true, trailing: true },
  );
}

export const cache = refCache<DKVOptions, DKV>({
  name: "dkv",
  createKey: ({ name, account_id, project_id }) =>
    JSON.stringify({ name, account_id, project_id }),
  createObject: async (opts) => {
    if (opts.client == null) {
      opts = { ...opts, client: await conat() };
    }
    const k = new DKV(opts);
    await k.init();
    return k;
  },
});

export async function dkv<T>(options: DKVOptions): Promise<DKV<T>> {
  return await cache(options);
}
