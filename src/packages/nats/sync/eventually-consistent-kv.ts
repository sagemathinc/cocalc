/*
Eventually Consistent Distributed Key:Value Store

DEVELOPMENT:

~/cocalc/src/packages/server$ node
Welcome to Node.js v18.17.1.
Type ".help" for more information.
> env = await require("@cocalc/backend/nats/env").getEnv(); a = require("@cocalc/nats/sync/eventually-consistent-kv"); s = new a.EventuallyConsistentKV({name:'test',env,filter:['foo.>'],resolve:({parent,local,remote})=>{return {...remote,...local}}}); await s.init();


In the browser console:

> s = await cc.client.nats_client.eckv({filter:['foo.>'],resolve:({parent,local,remote})=>{return {...remote,...local}}})

# NOTE that the name is account-{account_id} or project-{project_id},
# and if not given defaults to the account-{user's account id}
> s.kv.name
'account-6aae57c6-08f1-4bb5-848b-3ceb53e61ede'

> s.on('change',(key)=>console.log(key));0;
*/

import { EventEmitter } from "events";
import { KV } from "./kv";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { type NatsEnv } from "@cocalc/nats/types";
import { isEqual } from "lodash";
import { delay } from "awaiting";

const TOMBSTONE = Symbol("tombstone");

export class EventuallyConsistentKV extends EventEmitter {
  private kv?: KV;
  private local: { [key: string]: any } = {};
  private resolve: (opts: { ancestor; local; remote }) => any;
  private changed: Set<string> = new Set();

  constructor({
    name,
    env,
    filter,
    resolve,
    options,
  }: {
    name: string;
    env: NatsEnv;
    // conflict resolution
    resolve: (opts: { ancestor; local; remote }) => any;
    // filter: optionally restrict to subset of named kv store matching these subjects.
    // NOTE: any key name that you *set or delete* should match one of these
    filter?: string | string[];
    options?;
  }) {
    super();
    this.resolve = resolve;
    this.kv = new KV({ name, env, filter, options });
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
  };

  private handleRemoteChange = (key, remote, ancestor) => {
    const local = this.local[key];
    if (local !== undefined) {
      const value = this.resolve({ local, remote, ancestor });
      if (isEqual(value, remote)) {
        delete this.local[key];
      } else {
        this.local[key] = value ?? TOMBSTONE;
      }
    }
    this.emit("change", key);
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

  hasUnsavedChanges = () =>
    this.changed.size > 0 || Object.keys(this.local).length > 0;

  private save = reuseInFlight(async () => {
    let d = 100;
    while (true) {
      try {
        await this.attemptToSave();
        //console.log("successfully saved");
      } catch {
        //(err) {
        // console.log("problem saving", err);
      }
      if (this.hasUnsavedChanges()) {
        d = Math.min(10000, d * 1.3) + Math.random() * 100;
        await delay(d);
      } else {
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
    await this.kv.set(obj);
    for (const key in obj) {
      if (obj[key] === this.local[key] && !this.changed.has(key)) {
        delete this.local[key];
      }
    }
  });
}
