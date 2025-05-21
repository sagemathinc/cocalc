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

require("@cocalc/backend/conat"); a = require("@cocalc/conat/sync/general-dkv"); s = new a.GeneralDKV({name:'test',merge:({local,remote})=>{return {...remote,...local}}}); await s.init();


In the browser console:

> s = await cc.client.conat_client.dkv({filter:['foo.>'],merge:({local,remote})=>{return {...remote,...local}}})

# NOTE that the name is account-{account_id} or project-{project_id},
# and if not given defaults to the account-{user's account id}
> s.kv.name
'account-6aae57c6-08f1-4bb5-848b-3ceb53e61ede'

> s.on('change',(key)=>console.log(key));0;

*/

import { EventEmitter } from "events";
import { CoreStream } from "./core-stream";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { isEqual } from "lodash";
import { delay } from "awaiting";
import { map as awaitMap } from "awaiting";
import type { Client, Headers } from "@cocalc/conat/core/client";
import refCache from "@cocalc/util/refcache";
import { type JSONValue } from "@cocalc/util/types";
import { type KVLimits } from "./limits";

export const TOMBSTONE = Symbol("tombstone");
const MAX_PARALLEL = 250;

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
  limits?: Partial<KVLimits>;

  // if noAutosave is set, local changes are never saved until you explicitly
  // call "await this.save()", which will try once to save.  Changes made during
  // the save may not be saved though.
  // CAUTION: noAutosave is really  only meant for unit testing!  The save is
  // reuseInFlighted so a safe somewhere far away could be in progress starting
  // before your call to save, and when it finishes that's it, so what you just
  // did is not saved.  Take care.
  noAutosave?: boolean;

  noCache?: boolean;
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

  constructor({
    name,
    project_id,
    account_id,
    desc,
    client,
    merge,
    limits,
    noAutosave,
  }: DKVOptions) {
    super();
    this.name = name;
    this.desc = desc;
    this.merge = merge;
    this.noAutosave = !!noAutosave;
    this.kv = new CoreStream({
      name,
      project_id,
      account_id,
      client,
      limits,
      // we do not have any notion of ephemeral kv yet
      persist: true,
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

  init = reuseInFlight(async () => {
    if (this.kv == null) {
      throw Error("closed");
    }
    this.kv.on("change", this.handleRemoteChange);
    await this.kv.init();
    this.emit("connected");
  });

  close = async () => {
    if (this.kv == null) {
      return;
    }
    if (!this.noAutosave) {
      try {
        await this.save();
      } catch (err) {
        // [ ] TODO: try localStorage or a file?!  throw?
        console.log(
          `WARNING: unable to save some data when closing a general-dkv -- ${err}`,
        );
      }
    }
    this.kv.close();
    this.emit("closed");
    this.removeAllListeners();
    delete this.kv;
    // @ts-ignore
    delete this.local;
    // @ts-ignore
    delete this.options;
    // @ts-ignore
    delete this.changed;
    delete this.merge;
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

  private handleRemoteChange = (remote, _raw, key, prev) => {
    if (key === undefined) {
      // not part of kv store.
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

  get = (key: string): T | undefined => {
    if (this.kv == null) {
      throw Error("closed");
    }
    const local = this.local[key];
    if (local === TOMBSTONE) {
      return undefined;
    }
    if (local !== undefined) {
      return local;
    }
    return this.kv.getKv(key);
  };

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
  };

  setMany = (obj) => {
    for (const key in obj) {
      this.local[key] = this.toValue(obj[key]);
      this.changed.add(key);
    }
    if (!this.noAutosave) {
      this.save();
    }
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
      // one example error when there's a conflict brewing:
      /*
        {
          code: 10071,
          name: 'JetStreamApiError',
          message: 'wrong last sequence: 84492'
        }
        */
    }
    let d = 100;
    while (true) {
      let status;
      try {
        status = await this.attemptToSave();
        //console.log("successfully saved");
      } catch (_err) {
        //console.log("temporary issue saving", this.kv?.name, _err);
      }
      if (!this.hasUnsavedChanges()) {
        return status;
      }
      d = Math.min(10000, d * 1.3) + Math.random() * 100;
      await delay(d);
    }
  });

  private attemptToSave = reuseInFlight(async () => {
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
        status.delete += 1;
        status.unsaved -= 1;
        delete obj[key];
        if (!this.changed.has(key)) {
          // successfully saved this and user didn't make a change *during* the set
          this.discardLocalState(key);
        }
      }
    }
    const f = async (key) => {
      if (this.kv == null) {
        // closed
        return;
      }
      try {
        status.unsaved += 1;
        const previousSeq = this.seq(key);
        await this.kv.setKv(key, obj[key] as T, {
          ...this.options[key],
          previousSeq,
        });
        //         console.log("kv store -- attemptToSave succeed", this.desc, {
        //           key,
        //           value: obj[key],
        //         });
        status.unsaved -= 1;
        status.set += 1;
        if (!this.changed.has(key)) {
          // successfully saved this and user didn't make a change *during* the set
          this.discardLocalState(key);
        }
        // note that we CANNOT call  this.discardLocalState(key) here, because
        // this.get(key) needs to work immediately after save, but if this.local[key]
        // is deleted, then this.get(key) would be undefined, because
        // this.kv.getKv(key) only has value in it once the value is
        // echoed back from the server.
      } catch (err) {
        //         console.log("kv store -- attemptToSave failed", this.desc, err, {
        //           key,
        //           value: obj[key],
        //         });
        if (err.code == "REJECT" && err.key) {
          const value = this.local[err.key];
          // can never save this.
          this.discardLocalState(err.key);
          status.unsaved -= 1;
          this.emit("reject", { key: err.key, value });
        }
        if (err.message.startsWith("wrong last sequence")) {
          // this happens when another client has published a NEWER version of this key,
          // so the right thing is to just ignore this.  In a moment there will be no
          // need to save anything, since we'll receive a message that overwrites this key.
          return;
        }
        throw err;
      }
    };
    await awaitMap(Object.keys(obj), MAX_PARALLEL, f);
    return status;
  });

  stats = () => this.kv?.stats();
}

export const cache = refCache<DKVOptions, DKV>({
  name: "dkv",
  createKey: ({ name, account_id, project_id }) =>
    JSON.stringify({ name, account_id, project_id }),
  createObject: async (opts) => {
    const k = new DKV(opts);
    await k.init();
    return k;
  },
});

export async function dkv<T>(options: DKVOptions): Promise<DKV<T>> {
  return await cache(options);
}
