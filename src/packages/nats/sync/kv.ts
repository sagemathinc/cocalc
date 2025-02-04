/*
This is a simple KV wrapper around NATS's KV, for small KV stores, suitable for configuration data.

- it emits an event ('change', key, value) whenever anything changes

- explicitly call "await this.init()" to initialize it

- calling get() synchronously provides ALL the data.

- call await set({key:value, key2:value2, ...}) to set data, with the following semantics:

  - set ONLY makes a change if our local version (this.get()[key]) of the value is different from
    what you're trying to set the value to, where different is defiend by lodash isEqual.

  - if our local version this.get()[key] was not the most recent version in NATS, then the set will
    definitely throw an exception! This is fantastic because it means you can modify and save what
    is in the local cache on multiple nodes at once anywhere, and be 100% certain to never overwrite
    data in complicated objects.  Of course, you have to assume "await set()" will sometimes fail.

  - set "pipelines" in that MAX_PARALLEL_SET key/value pairs are set at once, without waiting
    for each set to get ACK'd from the server before doing more sets.  This makes this massively
    faster for bigger objects, but means that if "await set({...})" fails, you don't immediately
    know which keys were successfully set and which failed, though all that worked will get
    updated soon and reflected in get().

TODO:

- [ ] maybe expose some functionality related to versions/history?


DEVELOPMENT:

~/cocalc/src/packages/server$ n
Welcome to Node.js v18.17.1.
Type ".help" for more information.
> env = await require("@cocalc/backend/nats/env").getEnv(); a = require("@cocalc/nats/sync/kv"); s = new a.KV({name:'test',env,subjects:['foo.>']}); await s.init();

> await s.set({"foo.x":10}) // or s.set("foo.x", 10)
> s.get()
{ 'foo.x': 10 }
> await s.delete("foo.x")
undefined
> s.get()
{}
> await s.set({"foo.x":10, "foo.bar":20})

// Since the subjects are disjoint these are totally different:

> t = new a.KV({name:'test',env,subjects:['bar.>']}); await t.init();
> await t.get()
{}
> await t.set({"bar.abc":10})
undefined
> await t.get()
{ 'bar.abc': Uint8Array(2) [ 49, 48 ] }
> await s.get()
{ 'foo.x': 10, 'foo.bar': 20, 'bar.abc': 10 }

// The union:
> u = new a.KV({name:'test',env,subjects:['bar.>', 'foo.>']}); await u.init();
> u.get()
{ 'foo.x': 10, 'foo.bar': 20, 'bar.abc': 10 }
> await s.set({'foo.x':999})
undefined
> u.get()
{ 'foo.x': 999, 'foo.bar': 20, 'bar.abc': 10 }
*/

import { EventEmitter } from "events";
import { type NatsEnv } from "@cocalc/nats/types";
import { Kvm } from "@nats-io/kv";
import { getAllFromKv, matchesPattern } from "@cocalc/nats/util";
import { isEqual } from "lodash";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { map as awaitMap } from "awaiting";

const MAX_PARALLEL_SET = 50;

export class KV extends EventEmitter {
  public readonly name: string;
  private options?;
  private subjects?: string | string[];
  private env: NatsEnv;
  private kv?;
  private watch?;
  private all?: { [key: string]: any };
  private revisions?: { [key: string]: number };

  constructor({
    name,
    env,
    options,
    subjects,
  }: {
    name: string;
    // optionally restrict to subset of named kv store matching these subjects.
    // NOTE: any key name that you *set or delete* should match one of these
    subjects?: string | string[];
    env: NatsEnv;
    options?;
  }) {
    super();
    this.env = env;
    this.name = name;
    this.options = options;
    this.subjects = subjects;
    return new Proxy(this, {
      set(target, prop, value) {
        target.setOne(prop, value);
        return true;
      },
      get(target, prop) {
        return target[prop] ?? target.all?.[String(prop)];
      },
    });
  }

  init = reuseInFlight(async () => {
    if (this.all != null) {
      return;
    }
    const kvm = new Kvm(this.env.nc);
    this.kv = await kvm.create(this.name, {
      compression: true,
      ...this.options,
    });
    const { all, revisions } = await getAllFromKv({
      kv: this.kv,
      key: this.subjects,
    });
    this.revisions = revisions;
    for (const key in all) {
      all[key] = this.env.jc.decode(all[key]);
    }
    this.all = all;
    this.emit("connected");
    this.startWatch();
  });

  private startWatch = async () => {
    // watch for changes
    this.watch = await this.kv.watch({
      // we assume that we ONLY delete old items which are not relevant
      ignoreDeletes: true,
      include: "updates",
    });
    //for await (const { key, value } of this.watch) {
    for await (const { revision, key, value } of this.watch) {
      if (this.revisions == null || this.all == null) {
        return;
      }
      this.revisions[key] = revision;
      if (value.length == 0) {
        // delete
        delete this.all[key];
      } else {
        this.all[key] = this.env.jc.decode(value);
      }
      this.emit("change", key, this.all[key]);
    }
  };

  close = () => {
    this.watch?.stop();
    delete this.all;
    delete this.revisions;
    this.emit("closed");
    this.removeAllListeners();
  };

  get = (key?) => {
    if (key == undefined) {
      return { ...this.all };
    } else {
      return this.all?.[key];
    }
  };

  private matches = (key: string) => {
    if (this.subjects == null) {
      return true;
    }
    for (const pattern of this.subjects) {
      if (matchesPattern({ pattern, subject: key })) {
        return true;
      }
    }
    return false;
  };

  delete = async (key) => {
    if (!this.matches(key)) {
      throw Error(
        `delete: key (=${key}) must match one of the subjects: ${JSON.stringify(this.subjects)}`,
      );
    }
    if (this.all == null || this.revisions == null) {
      throw Error("not ready");
    }
    if (this.all[key] !== undefined) {
      const cur = this.all[key];
      try {
        delete this.all[key];
        const newRevision = await this.kv.delete(key);
        this.revisions[key] = newRevision;
      } catch (err) {
        if (cur === undefined) {
          delete this.all[key];
        } else {
          this.all[key] = cur;
        }
        throw err;
      }
    }
  };

  // delete all that we know about
  clear = async () => {
    await awaitMap(Object.keys(this.all), MAX_PARALLEL_SET, this.delete);
  };

  set = async (...args) => {
    if (args.length == 2) {
      await this.setOne(args[0], args[1]);
      return;
    }
    const obj = args[0];
    await awaitMap(
      Object.keys(obj),
      MAX_PARALLEL_SET,
      async (key) => await this.setOne(key, obj[key]),
    );
  };

  private setOne = async (key, value) => {
    if (!this.matches(key)) {
      throw Error(
        `set: key (=${key}) must match one of the subjects: ${JSON.stringify(this.subjects)}`,
      );
    }
    if (this.all == null || this.revisions == null) {
      throw Error("not ready");
    }
    if (isEqual(this.all[key], value)) {
      return;
    }
    if (value === undefined) {
      return await this.delete(key);
    }
    const revision = this.revisions[key];
    const val = this.env.jc.encode(value);
    const cur = this.all[key];
    try {
      this.all[key] = value;
      const newRevision = await this.kv.put(key, val, {
        previousSeq: revision,
      });
      this.revisions[key] = newRevision;
    } catch (err) {
      if (cur === undefined) {
        delete this.all[key];
      } else {
        this.all[key] = cur;
      }
      throw err;
    }
  };
}
