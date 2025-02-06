/*
Eventually Consistent Distributed Key:Value Store

DEVELOPMENT:

~/cocalc/src/packages/server$ node
Welcome to Node.js v18.17.1.
Type ".help" for more information.
> env = await require("@cocalc/backend/nats/env").getEnv(); a = require("@cocalc/nats/sync/eventually-consistent-kv"); s = new a.EventuallyConsistentKV({name:'test',env,filter:['foo.>'],merge:({parent,local,remote})=>local}); await s.init();
*/

import { EventEmitter } from "events";
import { KV } from "./kv";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { type NatsEnv } from "@cocalc/nats/types";

const TOMBSTONE = Symbol("tombstone");

export class EventuallyConsistentKV extends EventEmitter {
  private kv: KV;
  private local: { [key: string]: any } = {};
  private merge: (opts: { parent; local; remote }) => any;

  constructor({
    name,
    env,
    filter,
    merge,
    options,
  }: {
    name: string;
    env: NatsEnv;
    // conflict resolution
    merge: (opts: { parent; local; remote }) => any;
    // filter: optionally restrict to subset of named kv store matching these subjects.
    // NOTE: any key name that you *set or delete* should match one of these
    filter?: string | string[];
    options?;
  }) {
    super();
    this.merge = merge;
    this.kv = new KV({ name, env, filter, options });
    return new Proxy(this, {
      set(target, prop, value) {
        if (!target.kv.isValidKey(String(prop))) {
          throw Error(`set: key (=${String(prop)}) must match the filter`);
        }
        target.set(prop, value);
        return true;
      },
      get(target, prop) {
        const x =
          target[prop] ?? target.local[String(prop)] ?? target.kv.get(prop);
        return x === TOMBSTONE ? undefined : x;
      },
    });
  }

  init = reuseInFlight(async () => {
    await this.kv.init();
  });

  get = () => {
    const x = { ...this.kv.get(), ...this.local };
    for (const key in this.local) {
      if (this.local[key] === TOMBSTONE) {
        delete x[key];
      }
    }
    return x;
  };

  set = (...args) => {
    if (args.length == 2) {
      this.local[args[0]] = args[1] ?? TOMBSTONE;
      return;
    }
    const obj = args[0];
    for (const key in obj) {
      this.local[key] = obj[key] ?? TOMBSTONE;
    }
  };

  save = async () => {
    const obj = { ...this.local };
    for (const key in obj) {
      if (obj[key] === TOMBSTONE) {
        obj[key] = undefined;
      }
    }
    await this.kv.set(obj);
    for (const key in obj) {
      if (obj[key] === this.local[key]) {
        delete this.local[key];
      }
    }
  };
}
