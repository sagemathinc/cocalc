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

- Calling "store.get()" provides ALL the data, and "store.get(key)" gets one value.

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
> env = await require("@cocalc/backend/nats/env").getEnv(); a = require("@cocalc/nats/sync/dkv"); s = new a.DKV({name:'test',env,filter:['foo.>'],merge:({local,remote})=>{return {...remote,...local}}}); await s.init();


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
import { type NatsEnv } from "@cocalc/nats/types";
import { isEqual } from "lodash";
import { delay } from "awaiting";
import { map as awaitMap } from "awaiting";

const TOMBSTONE = Symbol("tombstone");
const MAX_PARALLEL = 50;

export type MergeFunction = (opts: {
  key: string;
  prev: any;
  local: any;
  remote: any;
}) => any;

export class GeneralDKV extends EventEmitter {
  private kv?: GeneralKV;
  private merge?: MergeFunction;
  private local: { [key: string]: any } = {};
  private changed: Set<string> = new Set();

  constructor({
    name,
    env,
    filter,
    merge,
    options,
    limits,
  }: {
    name: string;
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
    options?;
    limits?: KVLimits;
  }) {
    super();
    this.merge = merge;
    //this.limits = limits;
    this.kv = new GeneralKV({ name, env, filter, options, limits });
  }

  init = reuseInFlight(async () => {
    if (this.kv == null) {
      throw Error("closed");
    }
    this.kv.on("change", this.handleRemoteChange);
    await this.kv.init();
    this.emit("connected");
  });

  close = () => {
    if (this.kv == null) {
      return;
    }
    this.kv.close();
    this.emit("closed");
    this.removeAllListeners();
    delete this.kv;
    // @ts-ignore
    delete this.local;
    // @ts-ignore
    delete this.changed;
    delete this.merge;
  };

  private handleRemoteChange = ({ key, value: remote, prev }) => {
    const local = this.local[key];
    let value: any = remote;
    if (local !== undefined) {
      if (isEqual(local, remote)) {
        // we have a local change, but it's the same change as remote, so just
        // forget about our local change.
        delete this.local[key];
      } else {
        try {
          value = this.merge?.({ key, local, remote, prev }) ?? local;
//           console.log("handle merge conflict", {
//             key,
//             local,
//             remote,
//             prev,
//             value,
//           });
        } catch {
          // user provided a merge function that throws an exception. We select local, since
          // it is the newest, i.e., "last write wins"
          value = local;
        }
        if (isEqual(value, remote)) {
          // no change, so forget our local value
          delete this.local[key];
        } else {
          // resolve with the new value, or if it is undefined, a TOMBSTONE, meaning choice is to delete.
          this.local[key] = value ?? TOMBSTONE;
        }
      }
    }
    this.emit("change", { key, value, prev });
  };

  get = (key?) => {
    if (this.kv == null) {
      throw Error("closed");
    }
    if (key != null) {
      this.assertValidKey(key);
      const local = this.local[key];
      if (local === TOMBSTONE) {
        return undefined;
      }
      return local ?? this.kv.get(key);
    }
    const x = { ...this.kv.get(), ...this.local };
    for (const key in this.local) {
      if (this.local[key] === TOMBSTONE) {
        delete x[key];
      }
    }
    return x;
  };

  time = (key?: string) => {
    if (this.kv == null) {
      throw Error("closed");
    }
    return this.kv.time(key);
  };

  private assertValidKey = (key) => {
    if (this.kv == null) {
      throw Error("closed");
    }
    this.kv.assertValidKey(key);
  };

  delete = (key) => {
    this.assertValidKey(key);
    this.local[key] = TOMBSTONE;
    this.changed.add(key);
    this.save();
  };

  set = (...args) => {
    if (args.length == 2) {
      this.assertValidKey(args[0]);
      this.local[args[0]] = args[1] ?? TOMBSTONE;
      this.changed.add(args[0]);
    } else {
      const obj = args[0];
      for (const key in obj) {
        this.assertValidKey(key);
        this.local[key] = obj[key] ?? TOMBSTONE;
        this.changed.add(key);
      }
    }
    this.save();
  };

  hasUnsavedChanges = () => {
    if (this.kv == null) {
      return false;
    }
    return this.changed.size > 0 || Object.keys(this.local).length > 0;
  };

  unsavedChanges = () => {
    return Object.keys(this.local);
  };

  private save = reuseInFlight(async () => {
    let d = 100;
    while (true) {
      try {
        await this.attemptToSave();
        //console.log("successfully saved");
      } catch {
        d = Math.min(10000, d * 1.3) + Math.random() * 100;
        await delay(d);
        // console.log("temporary issue saving")
      }
      if (!this.hasUnsavedChanges()) {
        return;
      }
    }
  });

  private attemptToSave = reuseInFlight(async () => {
    if (this.kv == null) {
      throw Error("closed");
    }
    this.changed.clear();
    const obj = { ...this.local };
    for (const key in obj) {
      if (obj[key] === TOMBSTONE) {
        await this.kv.delete(key);
        delete obj[key];
        if (!this.changed.has(key)) {
          delete this.local[key];
        }
      }
    }
    const f = async (key) => {
      if (this.kv == null) {
        // closed
        return;
      }
      try {
        await this.kv.set(key, obj[key]);
        if (obj[key] === this.local[key] && !this.changed.has(key)) {
          // successfully saved this
          delete this.local[key];
        }
      } catch (err) {
        if (err.code == "REJECT" && err.key) {
          delete this.local[err.key]; // can never save this.
          this.emit("reject", { key: err.key, value: this.local[err.key] });
        }
        throw err;
      }
    };
    await awaitMap(Object.keys(obj), MAX_PARALLEL, f);
  });
}
