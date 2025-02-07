/*
Eventually Consistent Distributed Key:Value Store

DEVELOPMENT:

~/cocalc/src/packages/server$ node
Welcome to Node.js v18.17.1.
Type ".help" for more information.
> env = await require("@cocalc/backend/nats/env").getEnv(); a = require("@cocalc/nats/sync/eventually-consistent-kv"); s = new a.EventuallyConsistentKV({name:'test',env,filter:['foo.>'],resolve:({parent,local,remote})=>{return {...remote,...local}}}); await s.init();
*/

import { EventEmitter } from "events";
import { KV } from "./kv";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { type NatsEnv } from "@cocalc/nats/types";
import { isEqual } from "lodash";

const TOMBSTONE = Symbol("tombstone");

export class EventuallyConsistentKV extends EventEmitter {
  private kv: KV;
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
    this.kv.on("change", this.handleRemoteChange);
    await this.kv.init();
  });

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
  };

  get = () => {
    const x = { ...this.kv.get(), ...this.local };
    for (const key in this.local) {
      if (this.local[key] === TOMBSTONE) {
        delete x[key];
      }
    }
    return x;
  };

  delete = (key) => {
    this.local[key] = TOMBSTONE;
    this.changed.add(key);
  };

  set = (...args) => {
    if (args.length == 2) {
      this.local[args[0]] = args[1] ?? TOMBSTONE;
      this.changed.add(args[0]);
    } else {
      const obj = args[0];
      for (const key in obj) {
        this.local[key] = obj[key] ?? TOMBSTONE;
        this.changed.add(key);
      }
    }
    this.tryToSave();
  };

  private tryToSave = async () => {
    try {
      await this.save();
    } catch (err) {
      console.log("problem saving", err);
    }
    if (Object.keys(this.local).length > 0) {
      setTimeout(this.tryToSave, 100);
    }
  };

  private save = reuseInFlight(async () => {
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
