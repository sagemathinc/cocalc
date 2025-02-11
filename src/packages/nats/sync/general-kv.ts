/*
Always Consistent Centralized Key Value Store

- You give one or more subjects and this provides an asynchronous but consistent
  way to work with the KV store of keys matching any of those subjects,
  inside of the named KV store.
- The get operation is sync. (It can of course be slightly out of date, but that is detected
  if you try to immediately write it.)
- The set will fail if the local cached value (returned by get) turns out to be out of date.
- Also delete and set will fail if the NATS connection is down or times out.
- For an eventually consistent sync wrapper around this, use DKV, defined in the sibling file dkv.ts.

This is a simple KV wrapper around NATS's KV, for small KV stores. Each client holds a local cache
of all data, which is used to ensure set's are a no-op if there is no change.  Also, this automates
ensuring that if you do a read-modify-write, this will succeed only if nobody else makes a change
before you.

- You must explicitly call "await store.init()" to initialize it before using it.

- The store emits an event ('change', key, newValue, previousValue) whenever anything changes

- Calling "store.get()" provides ALL the data and is synchronous.   It uses various API tricks to
  ensure this is fast and is updated when there is any change from upstream.  Use "store.get(key)"
  to get the value of one key.

- Use "await store.set(key,value)" or "await store.set({key:value, key2:value2, ...})" to set data,
  with the following semantics:

  - set ONLY makes a change if our local version ("store.get(key)") of the value is different from
    what you're trying to set the value to, where different is defined by lodash isEqual.

  - if our local version this.get(key) was not the most recent version in NATS, then the set will
    definitely throw an exception! This is fantastic because it means you can modify and save what
    is in the local cache on multiple nodes at once anywhere, and be 100% certain to never overwrite
    data in complicated objects.  Of course, you have to assume "await store.set(...)" WILL
    sometimes fail.

  - Set with multiple keys "pipelines" in that MAX_PARALLEL key/value pairs are set at once, without
    waiting for every single individual set to get ACK'd from the server before doing more sets.
    This makes this **massively** faster, but means that if "await store.set(...)" fails, you don't
    immediately know which keys were successfully set and which failed, though all keys worked will get
    updated soon and reflected in store.get().

- Use "await store.expire(ageMs)" to delete every key that was last changed at least ageMs
  milliseconds in the past.

  TODO/WARNING: the timestamps are defined by NATS (and its clock), but
  the definition of "ageMs in the past" is defined by the client where this is called. Thus
  if the client's clock is off, that would be a huge problem.  An obvious solution is to
  get the current time from NATS, and use that.  I don't know a "good" way to get the current
  time except maybe publishing a message to myself...?

TODO:

- [ ] maybe expose some functionality related to versions/history?

DEVELOPMENT:

~/cocalc/src/packages/server$ n
Welcome to Node.js v18.17.1.
Type ".help" for more information.
> env = await require("@cocalc/backend/nats/env").getEnv(); a = require("@cocalc/nats/sync/general-kv"); s = new a.GeneralKV({name:'test',env,filter:['foo.>']}); await s.init();

> await s.set({"foo.x":10}) // or s.set("foo.x", 10)
> s.get()
{ 'foo.x': 10 }
> await s.delete("foo.x")
undefined
> s.get()
{}
> await s.set({"foo.x":10, "foo.bar":20})

// Since the filters are disjoint these are totally different:

> t = new a.KV({name:'test',env,filter:['bar.>']}); await t.init();
> await t.get()
{}
> await t.set({"bar.abc":10})
undefined
> await t.get()
{ 'bar.abc': Uint8Array(2) [ 49, 48 ] }
> await s.get()
{ 'foo.x': 10, 'foo.bar': 20, 'bar.abc': 10 }

// The union:
> u = new a.KV({name:'test',env,filter:['bar.>', 'foo.>']}); await u.init();
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
import {
  getAllFromKv,
  matchesPattern,
  millis,
  type Nanos,
} from "@cocalc/nats/util";
import { isEqual } from "lodash";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { map as awaitMap } from "awaiting";
import { throttle } from "lodash";

class RejectError extends Error {
  code: string;
  key: string;
}

const MAX_PARALLEL = 50;

// Note that the limit options are named in exactly the same was as for streams,
// which is convenient for consistency.  This is not consistent with NATS's
// own KV store limit naming.
const ENFORCE_LIMITS_THROTTLE_MS = 3000;
export interface KVLimits {
  // How many keys may be in the KV store. Oldest keys will be removed
  // if the key-value store exceeds this size. -1 for unlimited.
  max_msgs: number;

  // Maximum age of any key, expressed in nanoseconds. 0 for unlimited.
  // Use 'import {nanos} from "@cocalc/nats/util"' then "nanos(milliseconds)"
  // to give input in milliseconds.
  max_age: Nanos; // nanoseconds!

  // The maximum number of bytes to store in this KV, which means
  // the total of the bytes used to store everything.  Since we store
  // the key with each value (to have arbitrary keys), this includes
  // the size of the keys.
  max_bytes: number;

  // The maximum size of any single value, including the key.
  max_msg_size: number;
}

export class GeneralKV extends EventEmitter {
  public readonly name: string;
  private options?;
  private filter?: string[];
  private env: NatsEnv;
  private kv?;
  private watch?;
  private all?: { [key: string]: any };
  private revisions?: { [key: string]: number };
  private times?: { [key: string]: Date };
  private sizes?: { [key: string]: number };
  private limits: KVLimits;

  constructor({
    name,
    env,
    filter,
    options,
    limits,
  }: {
    name: string;
    // filter: optionally restrict to subset of named kv store matching these subjects.
    // NOTE: any key name that you *set or delete* should match one of these
    filter?: string | string[];
    env: NatsEnv;
    options?;
    limits?: KVLimits;
  }) {
    super();
    this.limits = {
      max_msgs: -1,
      max_age: 0,
      max_bytes: -1,
      max_msg_size: -1,
      ...limits,
    };

    this.env = env;
    this.name = name;
    this.options = options;
    this.filter = typeof filter == "string" ? [filter] : filter;
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
    const { all, revisions, times } = await getAllFromKv({
      kv: this.kv,
      key: this.filter,
    });
    this.revisions = revisions;
    this.times = times;
    this.sizes = {};
    for (const key in all) {
      this.sizes[key] = all[key].length;
      all[key] = this.env.jc.decode(all[key]);
    }
    this.all = all;
    this.emit("connected");
    this.startWatch();
  });

  private startWatch = async () => {
    // watch for changes
    this.watch = await this.kv.watch({
      ignoreDeletes: false,
      include: "updates",
      key: this.filter,
    });
    for await (const x of this.watch) {
      const { revision, key, value, sm } = x;
      if (
        this.revisions == null ||
        this.all == null ||
        this.times == null ||
        this.sizes == null
      ) {
        return;
      }
      this.revisions[key] = revision;
      const prev = this.all[key];
      if (value.length == 0) {
        // delete
        delete this.all[key];
        delete this.times[key];
        delete this.sizes[key];
      } else {
        this.all[key] = this.env.jc.decode(value);
        this.times[key] = sm.time;
        this.sizes[key] = value.length;
      }
      this.emit("change", { key, value: this.all[key], prev });
      this.enforceLimits();
    }
  };

  close = () => {
    this.watch?.stop();
    delete this.all;
    delete this.times;
    delete this.revisions;
    delete this.sizes;
    this.emit("closed");
    this.removeAllListeners();
  };

  get = (key?) => {
    if (this.all == null) {
      throw Error("not initialized");
    }
    if (key == undefined) {
      return { ...this.all };
    } else {
      return this.all?.[key];
    }
  };

  get length() {
    return Object.keys(this.all ?? {}).length;
  }

  has = (key: string): boolean => {
    return this.all?.[key] !== undefined;
  };

  time = (key?: string) => {
    if (key == null) {
      return this.times;
    } else {
      return this.times?.[key];
    }
  };

  assertValidKey = (key: string) => {
    if (!this.isValidKey(key)) {
      throw Error(
        `delete: key (=${key}) must match the filter: ${JSON.stringify(this.filter)}`,
      );
    }
  };

  isValidKey = (key: string) => {
    if (this.filter == null) {
      return true;
    }
    for (const pattern of this.filter) {
      if (matchesPattern({ pattern, subject: key })) {
        return true;
      }
    }
    return false;
  };

  delete = async (key, revision?) => {
    this.assertValidKey(key);
    if (
      this.all == null ||
      this.revisions == null ||
      this.times == null ||
      this.sizes == null
    ) {
      throw Error("not ready");
    }
    if (this.all[key] !== undefined) {
      const cur = this.all[key];
      try {
        const newRevision = await this.kv.delete(key, {
          previousSeq: revision ?? this.revisions[key],
        });
        this.revisions[key] = newRevision;
      } catch (err) {
        this.all[key] = cur;
        throw err;
      }
    }
  };

  // delete everything matching the filter that hasn't been set
  // in the given amount of ms.  Returns number of deleted records.
  // NOTE: This could throw an exception if something that would expire
  // were changed right when this is run then it would get expired
  // but shouldn't.  In that case, run it again.
  expire = async ({
    cutoff,
    ageMs,
  }: {
    cutoff?: Date;
    ageMs?: number;
  }): Promise<number> => {
    if (!ageMs && !cutoff) {
      throw Error("one of ageMs or cutoff must be set");
    }
    if (ageMs && cutoff) {
      throw Error("exactly one of ageMs or cutoff must be set");
    }
    if (this.times == null || this.all == null) {
      throw Error("not initialized");
    }
    if (ageMs && !cutoff) {
      cutoff = new Date(Date.now() - ageMs);
    }
    if (cutoff == null) {
      throw Error("impossible");
    }
    // make copy of revisions *before* we start deleting so that
    // if a key is changed exactly while deleting we get an error
    // and don't accidently delete it!
    const revisions = { ...this.revisions };
    const toDelete = Object.keys(this.all).filter(
      (key) => this.times?.[key] != null && this.times[key] <= cutoff,
    );
    if (toDelete.length > 0) {
      await awaitMap(toDelete, MAX_PARALLEL, async (key) => {
        await this.delete(key, revisions[key]);
      });
    }
    return toDelete.length;
  };

  // delete all that we know about
  clear = async () => {
    if (this.all == null) {
      throw Error("not initialized");
    }
    await awaitMap(Object.keys(this.all), MAX_PARALLEL, this.delete);
  };

  set = async (...args) => {
    if (args.length == 2) {
      await this.setOne(args[0], args[1]);
      return;
    }
    const obj = args[0];
    await awaitMap(
      Object.keys(obj),
      MAX_PARALLEL,
      async (key) => await this.setOne(key, obj[key]),
    );
  };

  private setOne = async (key, value) => {
    if (!this.isValidKey(key)) {
      throw Error(
        `set: key (=${key}) must match the filter: ${JSON.stringify(this.filter)}`,
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
    if (
      this.limits.max_msg_size > -1 &&
      val.length > this.limits.max_msg_size
    ) {
      // we reject due to our own size reasons
      const err = new RejectError(
        `message key:value size (=${val.length}) exceeds max_msg_size=${this.limits.max_msg_size} bytes`,
      );
      err.code = "REJECT";
      err.key = key;
      throw err;
    }
    try {
      await this.kv.put(key, val, {
        previousSeq: revision,
      });
    } catch (err) {
      if (err.code == "MAX_PAYLOAD_EXCEEDED") {
        // nats rejects due to payload size
        const err2 = new RejectError(`${err}`);
        err2.code = "REJECT";
        err2.key = key;
        throw err2;
      } else {
        throw err;
      }
    }
  };

  // ensure any limits are satisfied, always by deleting old keys
  private enforceLimits = throttle(
    reuseInFlight(async () => {
      if (this.all == null || this.times == null || this.sizes == null) {
        return;
      }
      const { max_msgs, max_age, max_bytes } = this.limits;
      let times: { time: Date; key: string }[] | null = null;
      const getTimes = (): { time: Date; key: string }[] => {
        if (times == null) {
          // this is potentially a little worrisome regarding performance, but
          // it has to be done, or we have to do something elsewhere to maintain
          // this info.  The intention with these kv's is they are small and all
          // in memory.
          const v: { time: Date; key: string }[] = [];
          for (const key in this.times) {
            v.push({ time: this.times[key], key });
          }
          v.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
          times = v;
        }
        return times!;
      };

      // we check with each defined limit if some old messages
      // should be dropped, and if so move limit forward.  If
      // it is above -1 at the end, we do the drop.
      let index = -1;
      const setIndex = (i, _limit) => {
        // console.log("setIndex", { i, _limit });
        index = Math.max(i, index);
      };

      //max_msgs = max number of keys
      const v = Object.keys(this.all);
      if (max_msgs > -1 && v.length > max_msgs) {
        // ensure there are at most this.limits.max_msgs messages
        // by deleting the oldest ones up to a specified point.
        const i = v.length - max_msgs;
        if (i > 0) {
          setIndex(i - 1, "max_msgs");
        }
      }

      // max_age
      if (max_age > 0) {
        const times = getTimes();
        if (times.length > 1) {
          // expire messages older than max_age nanoseconds
          // to avoid potential clock skew, we define *now* as the time of the most
          // recent message.  For us, this should be fine, since we only impose limits
          // when writing new messages, and none of these limits are guaranteed.
          const now = times[times.length - 1].time.valueOf();
          const cutoff = new Date(now - millis(max_age));
          for (let i = times.length - 2; i >= 0; i--) {
            if (times[i].time < cutoff) {
              // it just went over the limit.  Everything before
              // and including the i-th message should be deleted.
              setIndex(i, "max_age");
              break;
            }
          }
        }
      }

      // max_bytes
      if (max_bytes >= 0) {
        let t = 0;
        const times = getTimes();
        for (let i = times.length - 1; i >= 0; i--) {
          t += this.sizes[times[i].key];
          if (t > max_bytes) {
            // it just went over the limit.  Everything before
            // and including the i-th message must be deleted.
            setIndex(i, "max_bytes");
            break;
          }
        }
      }

      if (index > -1 && this.times != null) {
        try {
          // console.log("enforceLimits: deleting ", { index });
          const times = getTimes();
          const toDelete = times.slice(0, index + 1).map(({ key }) => key);
          if (toDelete.length > 0) {
            // console.log("enforceLImits: deleting ", toDelete.length, " keys");
            const revisions = { ...this.revisions };
            await awaitMap(toDelete, MAX_PARALLEL, async (key) => {
              await this.delete(key, revisions[key]);
            });
          }
        } catch (err) {
          if (err.code != "TIMEOUT") {
            console.log(`WARNING: expiring old messages - ${err}`);
          }
        }
      }
    }),
    ENFORCE_LIMITS_THROTTLE_MS,
    { leading: true, trailing: true },
  );
}
