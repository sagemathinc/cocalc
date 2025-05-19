/*
Eventually Consistent Distributed Key:Value Store

- You give one or more subjects and this provides a synchronous eventually consistent
  "multimaster" distributed way to work with the KV store of keys matching any of those subjects,
  inside of the named KV store.
- You should define a 3-way merge function, which is used to automatically resolve all
  conflicting writes.   The default is to use our local version, i.e., "last write to remote wins".
- All set/get/delete operations are synchronous.
- The state gets sync'd in the backend to NATS as soon as possible.

This class is based on top of the Consistent Centralized Key:Value Store defined in kv.ts.
You can use the same key:value store at the same time via both interfaces, and if store
is a DKV, you can also access the underlying KV via "store.kv".

- You must explicitly call "await store.init()" to initialize this before using it.

- The store emits an event ('change', key) whenever anything changes.

- Calling "store.getAll()" provides ALL the data, and "store.get(key)" gets one value.

- Use "store.set(key,value)" or "store.set({key:value, key2:value2, ...})" to set data,
  with the following semantics:

  - in the background, changes propagate to NATS.  You do not do anything explicitly and
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

~/cocalc/src/packages/server$ node
Welcome to Node.js v18.17.1.
Type ".help" for more information.
> env = await require("@cocalc/backend/nats/env").getEnv(); a = require("@cocalc/conat/sync/dkv"); s = new a.DKV({name:'test',env,filter:['foo.>'],merge:({local,remote})=>{return {...remote,...local}}}); await s.init();


In the browser console:

> s = await cc.client.nats_client.dkv({filter:['foo.>'],merge:({local,remote})=>{return {...remote,...local}}})

# NOTE that the name is account-{account_id} or project-{project_id},
# and if not given defaults to the account-{user's account id}
> s.kv.name
'account-6aae57c6-08f1-4bb5-848b-3ceb53e61ede'

> s.on('change',(key)=>console.log(key));0;


TODO:
 - require not-everything subject or have an explicit size limit?
 - some history would be VERY useful here due to the merge conflicts.
 - for conflict resolution maybe instead of local and remote, just give
   two values along with their assigned sequence numbers (?).  I.e., something
   where the resolution doesn't depend on where it is run.  ?  Or maybe this doesn't matter.
*/

import { EventEmitter } from "events";
import { GeneralKV, type KVLimits } from "./general-kv";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { type NatsEnv, type ValueType } from "@cocalc/conat/types";
import { isEqual } from "lodash";
import { delay } from "awaiting";
import { map as awaitMap } from "awaiting";
import { getClient, type ClientWithState } from "@cocalc/conat/client";

export const TOMBSTONE = Symbol("tombstone");
const MAX_PARALLEL = 250;

export type MergeFunction = (opts: {
  key: string;
  prev: any;
  local: any;
  remote: any;
}) => any;

interface Options {
  headers?: { [name: string]: string | null };
}

export class GeneralDKV<T = any> extends EventEmitter {
  private kv?: GeneralKV<T>;
  private jc?;
  private merge?: MergeFunction;
  private local: { [key: string]: T | typeof TOMBSTONE } = {};
  private options: { [key: string]: Options } = {};
  private saved: { [key: string]: T | typeof TOMBSTONE } = {};
  private changed: Set<string> = new Set();
  private noAutosave: boolean;
  private client?: ClientWithState;
  public readonly valueType: ValueType;
  public readonly name: string;
  public readonly desc?: string;

  constructor({
    name,
    env,
    filter,
    merge,
    options,
    noAutosave,
    limits,
    valueType,
    desc,
  }: {
    name: string;
    // used for log and error messages
    desc: string;
    env: NatsEnv;
    // 3-way merge conflict resolution
    merge?: (opts: {
      key: string;
      prev?: any;
      local?: any;
      remote?: any;
    }) => any;
    // filter: optionally restrict to subset of named kv store matching these subjects.
    // NOTE: any key name that you *set or delete* must match one of these
    filter: string | string[];
    limits?: KVLimits;
    // if noAutosave is set, local changes are never saved until you explicitly
    // call "await this.save()", which will try once to save.  Changes made during
    // the save may not be saved though.
    noAutosave?: boolean;
    options?;
    valueType?: ValueType;
  }) {
    super();
    this.name = name;
    this.desc = desc;
    this.merge = merge;
    this.noAutosave = !!noAutosave;
    this.jc = env.jc;
    this.valueType = valueType ?? "json";
    this.kv = new GeneralKV({ name, env, filter, options, limits, valueType });
    if (!noAutosave) {
      this.client = getClient();
      this.client.on("connected", this.save);
    }
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
      this.client?.removeListener("connected", this.save);
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

  private handleRemoteChange = ({ key, value: remote, prev }) => {
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
    this.assertValidKey(key);
    const local = this.local[key];
    if (local === TOMBSTONE) {
      return undefined;
    }
    if (local !== undefined) {
      return local;
    }
    return this.kv.get(key);
  };

  get length(): number {
    // not efficient
    return Object.keys(this.getAll()).length;
  }

  getAll = (): { [key: string]: T } => {
    if (this.kv == null) {
      throw Error("closed");
    }
    const x = { ...this.kv.getAll(), ...this.local };
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
    return this.kv.has(key);
  };

  time = (key?: string): { [key: string]: Date } | Date | undefined => {
    if (this.kv == null) {
      throw Error("closed");
    }
    return this.kv.time(key);
  };

  private assertValidKey = (key): void => {
    if (this.kv == null) {
      throw Error("closed");
    }
    this.kv.assertValidKey(key);
  };

  private _delete = (key) => {
    this.local[key] = TOMBSTONE;
    this.changed.add(key);
  };

  delete = (key) => {
    this.assertValidKey(key);
    this._delete(key);
    if (!this.noAutosave) {
      this.save();
    }
  };

  clear = () => {
    if (this.kv == null) {
      throw Error("closed");
    }
    for (const key in this.kv.getAll()) {
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
    if (this.valueType == "binary") {
      if (!ArrayBuffer.isView(obj)) {
        throw Error("value must be an array buffer");
      }
      return obj;
    }
    // It's EXTREMELY important that anything we save to NATS has the property that
    // jc.decode(jc.encode(obj)) is the identity map. That is very much NOT
    // the case for stuff that set gets called on, e.g., {a:new Date()}.
    // Thus before storing it in in any way, we ensure this immediately:
    return this.jc.decode(this.jc.encode(obj));
  };

  headers = (key: string): { [key: string]: string } | undefined => {
    return this.kv?.headers(key);
  };

  set = (key: string, value: T, options?: Options) => {
    this.assertValidKey(key);
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
      this.assertValidKey(key);
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

  unsavedChanges = () => {
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
        await this.kv.delete(key);
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
        await this.kv.set(key, obj[key] as T, this.options[key]);
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
        // this.kv.get(key) only has value in it once the value is
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
        if (
          err.code == "10071" &&
          err.message.startsWith("wrong last sequence")
        ) {
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
