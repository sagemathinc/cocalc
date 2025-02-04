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
*/

import { EventEmitter } from "events";
import { type NatsEnv } from "@cocalc/nats/types";
import { Kvm } from "@nats-io/kv";
import { getAllFromKv } from "@cocalc/nats/util";
import { isEqual } from "lodash";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { map as awaitMap } from "awaiting";

const MAX_PARALLEL_SET = 50;

export class KV extends EventEmitter {
  public readonly name: string;
  private options?;
  private env: NatsEnv;
  private kv?;
  private watch?;
  private all?: { [key: string]: any };
  private revisions?: { [key: string]: number };

  constructor({
    name,
    env,
    options,
  }: {
    name: string;
    env: NatsEnv;
    options?;
  }) {
    super();
    this.env = env;
    this.name = name;
    this.options = options;
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
    });
    this.revisions = revisions;
    for (const k in all) {
      all[k] = this.env.jc.decode(all[k]);
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

  get = () => {
    return { ...this.all };
  };

  delete = async (key) => {
    if (this.all == null) {
      throw Error("not ready");
    }
    if (this.all[key] != null) {
      await this.kv.delete(key);
    }
    delete this.all[key];
  };

  set = async (obj) => {
    await awaitMap(
      Object.keys(obj),
      MAX_PARALLEL_SET,
      async (key) => await this.setOne(key, obj[key]),
    );
  };

  private setOne = async (key, value) => {
    if (this.all == null || this.revisions == null) {
      throw Error("not ready");
    }
    if (isEqual(this.all[key], value)) {
      return;
    }
    const revision = this.revisions[key];
    const val = this.env.jc.encode(value);
    const newRevision = await this.kv.put(key, val, {
      previousSeq: revision,
    });
    this.revisions[key] = newRevision;
    this.all[key] = val;
  };
}
