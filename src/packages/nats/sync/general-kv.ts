/*
Async Consistent Centralized Key Value Store

- You give one or more subjects and this provides an asynchronous but consistent
  way to work with the KV store of keys matching any of those subjects,
  inside of the named KV store.
- The get operation is sync. (It can of course be slightly out of date, but that is detected
  if you try to immediately write it.)
- The set will fail if the local cached value (returned by get) turns out to be out of date.
- Also delete and set will fail if the NATS connection is down or times out.
- For an eventually consistent sync wrapper around this, use DKV, defined in the sibling file dkv.ts.

WARNING: Nats itself actually currently seems to have no model for consistency, especially
with multiple nodes.  See https://github.com/nats-io/nats-server/issues/6557

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


CHUNKING:


Similar to streams, unlike NATS itself, hwere we allow storing arbitrarily large
values, in particular, values that could be much larger than the configured message
size.  When doing a set if the value exceeds the limit, we store the part of
the value that fits, and store a *header* that describes where the rest of the
values are stored.   For a given key, the extra chunks are stored with keys:

          ${key}.${i}.chunk

When receiving changes, these extra chunks are temporarily kept separately,
then used to compute the value for key.  All other paramaters, e.g., sequence
numbers, last time, etc., use the main key.

TODO:

- [ ] maybe expose some functionality related to versions/history?

DEVELOPMENT:

(See packages/backend/nats/test/sync/general-kv.test.ts for a unit tested version of what is below that
actually works.)

~/cocalc/src/packages/server$ n
Welcome to Node.js v18.17.1.
Type ".help" for more information.
> env = await require("@cocalc/backend/nats/env").getEnv(); a = require("@cocalc/nats/sync/general-kv"); s = new a.GeneralKV({name:'test',env,filter:['foo.>']}); await s.init();

> await s.set("foo.x", 10)
> s.getAll()
{ 'foo.x': 10 }
> await s.delete("foo.x")
undefined
> s.getAll()
{}
> await s.set("foo.x", 10)

// Since the filters are disjoint these are totally different:

> t = new a.GeneralKV({name:'test2',env,filter:['bar.>']}); await t.init();
> await t.getAll()
{}
> await t.set("bar.abc", 10)
undefined
> await t.getAll()
{ 'bar.abc': 10}
> await s.getAll()
{ 'foo.x': 10 }

// The union:
> u = new a.GeneralKV({name:'test3',env,filter:['bar.>', 'foo.>']}); await u.init();
> u.getAll()
{ 'foo.x': 10, 'bar.abc': 10 }
> await s.set('foo.x', 999)
undefined
> u.getAll()
{ 'bar.abc': 10, 'foo.x': 999}
*/

import { EventEmitter } from "events";
import { type NatsEnv } from "@cocalc/nats/types";
import { Kvm } from "@nats-io/kv";
import { getAllFromKv, matchesPattern, getMaxPayload } from "@cocalc/nats/util";
import { isEqual } from "lodash";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { map as awaitMap } from "awaiting";
import { throttle } from "lodash";
import { delay } from "awaiting";
import { headers as createHeaders } from "@nats-io/nats-core";
import type { MsgHdrs } from "@nats-io/nats-core";
import type { ValueType } from "@cocalc/nats/types";

const PUBLISH_TIMEOUT = 15000;

class RejectError extends Error {
  code: string;
  key: string;
}

const MAX_PARALLEL = 250;

const WATCH_MONITOR_INTERVAL = 15 * 1000;

// Note that the limit options are named in exactly the same was as for streams,
// which is convenient for consistency.  This is not consistent with NATS's
// own KV store limit naming.

// Significant throttling is VERY, VERY important, since purging old messages frequently
// seems to put a very significant load on NATS!
const ENFORCE_LIMITS_THROTTLE_MS = process.env.COCALC_TEST_MODE ? 100 : 30000;

export interface KVLimits {
  // How many keys may be in the KV store. Oldest keys will be removed
  // if the key-value store exceeds this size. -1 for unlimited.
  max_msgs: number;

  // Maximum age of any key, expressed in milliseconds. 0 for unlimited.
  max_age: number;

  // The maximum number of bytes to store in this KV, which means
  // the total of the bytes used to store everything.  Since we store
  // the key with each value (to have arbitrary keys), this includes
  // the size of the keys.
  max_bytes: number;

  // The maximum size of any single value, including the key.
  max_msg_size: number;
}

export class GeneralKV<T = any> extends EventEmitter {
  public readonly name: string;
  private options?;
  private filter?: string[];
  private env: NatsEnv;
  private kv?;
  private watch?;
  private all?: { [key: string]: T };
  private revisions?: { [key: string]: number };
  private chunkCounts: { [key: string]: number } = {};
  private times?: { [key: string]: Date };
  private sizes?: { [key: string]: number };
  private allHeaders: { [key: string]: MsgHdrs } = {};
  private limits: KVLimits;
  private revision: number = 0;
  public readonly valueType: ValueType;
  private noWatch: boolean;

  constructor({
    name,
    env,
    filter,
    options,
    limits,
    valueType,
    noWatch,
  }: {
    name: string;
    // filter: optionally restrict to subset of named kv store matching these subjects.
    // NOTE: any key name that you *set or delete* should match one of these
    filter?: string | string[];
    env: NatsEnv;
    options?;
    limits?: Partial<KVLimits>;
    valueType?: ValueType;
    noWatch?: boolean;
  }) {
    super();
    this.limits = {
      max_msgs: -1,
      max_age: 0,
      max_bytes: -1,
      max_msg_size: -1,
      ...limits,
    };

    this.noWatch = !!noWatch;
    this.env = env;
    this.name = name;
    this.options = options;
    this.filter = typeof filter == "string" ? [filter] : filter;
    this.valueType = valueType ?? "json";
    if (this.valueType != "json" && this.valueType != "binary") {
      throw Error("valueType must be 'json' or 'binary'");
    }
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
    this.kv.validateKey = validateKey;
    this.kv.validateSearchKey = validateSearchKey;
    const { all, revisions, times, headers } = await getAllFromKv({
      kv: this.kv,
      key: this.filter,
    });
    this.revisions = revisions;
    this.times = times;
    this.allHeaders = {};
    this.chunkCounts = {};
    this.sizes = {};
    const usedKeys = new Set<string>();
    const all0: { [key: string]: T } = {};
    const chunkData: {
      [key: string]: { chunkCount?: number; chunks: Buffer[] };
    } = {};
    for (const key in all) {
      let value: Buffer | null = null;
      const chunkCount = getChunkCount(headers[key]);
      let chunkKey: string = "";
      let key0 = "";
      if (chunkCount) {
        if (chunkData[key] == null) {
          chunkData[key] = { chunkCount, chunks: [all[key]] };
        } else {
          chunkData[key].chunkCount = chunkCount;
          chunkData[key].chunks[0] = all[key];
        }
        chunkKey = key;
        this.allHeaders[key] = headers[key];
      } else if (isChunkedKey(key)) {
        delete this.times[key];
        delete this.revisions[key];
        const { key: ckey, index } = parseChunkedKey(key);
        chunkKey = ckey;
        if (chunkData[chunkKey] == null) {
          chunkData[chunkKey] = { chunks: [] };
        }
        chunkData[chunkKey].chunks[index] = all[key];
      } else {
        key0 = key;
        value = all[key];
        usedKeys.add(key0);
        this.allHeaders[key] = headers[key];
      }

      if (chunkKey && chunkData[chunkKey].chunkCount != null) {
        let i = 0;
        for (const chunk of chunkData[chunkKey].chunks) {
          if (chunk !== undefined) {
            i += 1;
          }
        }
        const { chunkCount } = chunkData[chunkKey];
        if (i >= chunkCount!) {
          // nextjs prod complains about this...
          // @ts-ignore
          value = Buffer.concat(chunkData[chunkKey].chunks);
          key0 = chunkKey;
          this.chunkCounts[key0] = chunkCount!;
          delete chunkData[chunkKey];
          usedKeys.add(chunkKey);
          for (let chunk = 1; chunk < chunkCount!; chunk++) {
            usedKeys.add(chunkedKey({ key: chunkKey, chunk }));
          }
        }
      }

      if (value == null) {
        continue;
      }
      this.sizes[key0] = value.length;
      try {
        all0[key0] = this.decode(value);
      } catch (err) {
        // invalid json -- corruption.  I hit this ONLY when doing development
        // and explicitly putting bad data in.  This isn't normal.  But it's
        // help to make this a warning, in order to not make all data not accessible.
        console.warn(`WARNING: unable to read ${key0} -- ${err}`);
      }
    }
    this.all = all0;
    this.revision = Math.max(0, ...Object.values(this.revisions));
    this.emit("connected");
    if (!this.noWatch) {
      this.startWatch();
      this.monitorWatch();
    }

    // Also anything left at this point is garbage that needs to be freed:
    for (const key in all) {
      if (!usedKeys.has(key)) {
        await this.kv.delete(key);
      }
    }
  });

  private encode = (value) => {
    return this.valueType == "json" ? this.env.jc.encode(value) : value;
  };

  private decode = (value) => {
    return this.valueType == "json" ? this.env.jc.decode(value) : value;
  };

  private restartWatch = () => {
    // we make a new watch, starting AFTER the last revision we retrieved
    this.watch?.stop(); // stop current watch
    // make new watch:
    const resumeFromRevision = this.revision ? this.revision + 1 : undefined;
    this.startWatch({ resumeFromRevision });
  };

  private startWatch = async ({
    resumeFromRevision,
  }: { resumeFromRevision?: number } = {}) => {
    // watch for changes
    this.watch = await this.kv.watch({
      ignoreDeletes: false,
      include: "updates",
      key: this.filter,
      resumeFromRevision,
    });
    const chunkData: {
      [key: string]: {
        chunkCount?: number;
        chunks: Buffer[];
        revision?: number;
      };
    } = {};
    for await (const x of this.watch) {
      const { revision, key, value, sm } = x;
      this.revision = revision;
      if (
        this.revisions == null ||
        this.all == null ||
        this.times == null ||
        this.sizes == null
      ) {
        return;
      }

      let value0: Buffer | null = null;
      const chunkCount = getChunkCount(sm.headers);
      let chunkKey: string = "";
      let key0 = "";
      let revision0 = 0;
      if (chunkCount) {
        if (chunkData[key] == null) {
          chunkData[key] = { chunkCount, chunks: [value], revision };
        } else {
          chunkData[key].chunkCount = chunkCount;
          chunkData[key].chunks[0] = value;
          chunkData[key].revision = revision;
        }
        chunkKey = key;
        this.allHeaders[key] = sm.headers;
      } else if (isChunkedKey(key)) {
        const { key: ckey, index } = parseChunkedKey(key);
        chunkKey = ckey;
        if (chunkData[chunkKey] == null) {
          chunkData[chunkKey] = { chunks: [] };
        }
        chunkData[chunkKey].chunks[index] = value;
      } else {
        key0 = key;
        value0 = value;
        revision0 = revision;
        if (value.length != 0) {
          // NOTE: we *only* set the header to remote when not deleting the key. Deleting
          // it would delete the header, which contains the actual non-hashed key.
          this.allHeaders[key] = sm.headers;
        }
        delete this.chunkCounts[key0];
      }

      if (chunkKey && chunkData[chunkKey].chunkCount != null) {
        let i = 0;
        for (const chunk of chunkData[chunkKey].chunks) {
          if (chunk !== undefined) {
            i += 1;
          }
        }
        const { chunkCount } = chunkData[chunkKey];
        if (i >= chunkCount!) {
          // @ts-ignore (for nextjs prod build)
          value0 = Buffer.concat(chunkData[chunkKey].chunks);
          key0 = chunkKey;
          const r = chunkData[chunkKey].revision;
          if (r == null) {
            throw Error("bug");
          }
          revision0 = r;
          this.chunkCounts[chunkKey] = chunkCount!;
          delete chunkData[chunkKey];
        }
      }

      if (value0 == null) {
        continue;
      }
      this.revisions[key0] = revision0;
      const prev = this.all[key0];
      if (value0.length == 0) {
        // delete
        delete this.all[key0];
        delete this.times[key0];
        delete this.sizes[key0];
        delete this.chunkCounts[key0];
      } else {
        this.all[key0] = this.decode(value0);
        this.times[key0] = sm.time;
        this.sizes[key0] = value0.length;
      }
      this.emit("change", { key: key0, value: this.all[key0], prev });
      this.enforceLimits();
    }
  };

  // For both the kv and streams as best I can tell we MUST periodically poll the
  // server to see if the watch is still working.  If not we create a new one
  // starting at the last revision we got.  The watch will of course stop working
  // randomly sometimes because browsers disconnect and reconnect.
  private monitorWatch = async () => {
    this.env.nc.on?.("reconnect", this.restartWatch);
    while (this.revisions != null) {
      await delay(WATCH_MONITOR_INTERVAL);
      if (this.revisions == null) {
        return;
      }
      if (this.watch == null) {
        continue;
      }
      // To see this happen, get the open files, then delete the consumer associated
      // to the watch:
      // This is in a browser with a project opened:
      //
      // o = await cc.client.nats_client.openFiles(cc.current().project_id)
      // o.dkv.generalDKV.kv.watch._data.delete()
      //
      // Now observe that "await o.dkv.generalDKV.kv.watch._data.info()" fails as below,
      // but within a few seconds everything is fine again.

      try {
        await this.watch._data.info();
      } catch (err) {
        if (this.revisions == null) {
          return;
        }
        if (
          err.name == "ConsumerNotFoundError" ||
          err.code == 10014 ||
          err.message == "consumer not found"
        ) {
          this.restartWatch();
        }
      }
    }
  };

  close = () => {
    if (this.revisions == null) {
      // already closed
      return;
    }
    this.watch?.stop();
    delete this.watch;
    delete this.all;
    delete this.times;
    delete this.revisions;
    delete this.sizes;
    // @ts-ignore
    delete this.allHeaders;
    this.emit("closed");
    this.removeAllListeners();
    this.env.nc.removeListener?.("reconnect", this.restartWatch);
  };

  headers = (key: string): { [key: string]: string } | undefined => {
    const headers = this.allHeaders?.[key];
    if (headers == null) {
      return;
    }
    const x: { [key: string]: string } = {};
    for (const [key, value] of headers) {
      if (key != CHUNKS_HEADER) {
        x[key] = value[0];
      }
    }
    return x;
  };

  get = (key: string): T => {
    if (this.all == null) {
      throw Error("not initialized");
    }
    return this.all[key];
  };

  getAll = (): { [key: string]: T } => {
    if (this.all == null) {
      throw Error("not initialized");
    }
    return { ...this.all };
  };

  get length(): number {
    if (this.all == null) {
      throw Error("not initialized");
    }
    return Object.keys(this.all).length;
  }

  has = (key: string): boolean => {
    return this.all?.[key] !== undefined;
  };

  time = (key?: string): { [key: string]: Date } | Date | undefined => {
    if (key == null) {
      return this.times;
    } else {
      return this.times?.[key];
    }
  };

  assertValidKey = (key: string): void => {
    if (!this.isValidKey(key)) {
      throw Error(
        `delete: key (=${key}) must match the filter: ${JSON.stringify(this.filter)}`,
      );
    }
  };

  isValidKey = (key: string): boolean => {
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

  delete = async (key: string, revision?: number) => {
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
        delete this.all[key];
      } catch (err) {
        this.all[key] = cur;
        throw err;
      }
      if (this.chunkCounts[key]) {
        // garbage collect the extra chunks
        for (let chunk = 1; chunk < this.chunkCounts[key]; chunk++) {
          await this.kv.delete(chunkedKey({ key, chunk }));
        }
        delete this.chunkCounts[key];
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

  setMany = async (
    obj: { [key: string]: T },
    headers?: { [key: string]: { [name: string]: string } },
  ) => {
    await awaitMap(
      Object.keys(obj),
      MAX_PARALLEL,
      async (key) => await this.set(key, obj[key], headers?.[key]),
    );
  };

  set = async (
    key: string,
    value: T,
    options?: { headers?: { [name: string]: string | null } },
  ) => {
    await this._set(key, value, options);
    if (this.all != null) {
      this.all[key] = value;
    }
  };

  private _set = async (
    key: string,
    value: T,
    options?: { headers?: { [name: string]: string | null } },
  ) => {
    if (!this.isValidKey(key)) {
      throw Error(
        `set: key (=${key}) must match the filter: ${JSON.stringify(this.filter)}`,
      );
    }
    if (this.all == null || this.revisions == null) {
      throw Error("not ready");
    }
    if (isEqual(this.all[key], value)) {
      // values equal.  What about headers?

      if (
        options?.headers == null ||
        Object.keys(options.headers).length == 0
      ) {
        return;
      }
      const { headers } = options;
      // maybe trying to change headers
      let changeHeaders = false;
      if (this.allHeaders[key] == null) {
        // this is null but headers isn't, so definitely trying to change
        changeHeaders = true;
      } else {
        // look to see if any header is explicitly being changed
        const keys = new Set(Object.keys(headers));
        for (const [k, v] of this.allHeaders[key]) {
          keys.delete(k);
          if (headers[k] !== undefined && headers[k] != v[0]) {
            changeHeaders = true;
            break;
          }
        }
        if (keys.size > 0) {
          changeHeaders = true;
        }
      }
      if (!changeHeaders) {
        // not changing any header
        return;
      }
    }
    if (value === undefined) {
      return await this.delete(key);
    }
    const revision = this.revisions[key];
    let val = this.encode(value);
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

    const maxMessageSize = getMaxPayload(this.env.nc) - 10000;
    // const maxMessageSize = 100;

    if (val.length > maxMessageSize) {
      // chunking
      let val0 = val;
      const chunks: Buffer[] = [];
      while (val0.length > 0) {
        chunks.push(val0.slice(0, maxMessageSize));
        val0 = val0.slice(maxMessageSize);
      }
      val = chunks[0];
      let allHeaders = createHeaders();
      allHeaders.append(CHUNKS_HEADER, `${chunks.length}`);
      if (options?.headers) {
        const { headers } = options;
        for (const k in headers) {
          const v = headers[k];
          if (v == null) {
            continue;
          }
          allHeaders.append(k, v);
        }
      }
      await jetstreamPut(this.kv, key, val, {
        previousSeq: revision,
        headers: allHeaders,
        timeout: PUBLISH_TIMEOUT,
      });
      // now save the other chunks somewhere.
      for (let i = 1; i < chunks.length; i++) {
        await jetstreamPut(this.kv, chunkedKey({ key, chunk: i }), chunks[i], {
          timeout: PUBLISH_TIMEOUT,
        });
      }
      if (chunks.length < (this.chunkCounts[key] ?? 0)) {
        // value previously had even more chunks, so we get rid of the extra chunks.
        for (
          let chunk = chunks.length;
          chunk < this.chunkCounts[key];
          chunk++
        ) {
          await this.kv.delete(chunkedKey({ key, chunk }));
        }
      }

      this.chunkCounts[key] = chunks.length;
    } else {
      // not chunking
      try {
        let allHeaders;
        if (options?.headers) {
          const { headers } = options;
          allHeaders = createHeaders();
          for (const k in headers) {
            const v = headers[k];
            if (v == null) {
              continue;
            }
            allHeaders.append(k, v);
          }
        } else {
          allHeaders = undefined;
        }
        await jetstreamPut(this.kv, key, val, {
          previousSeq: revision,
          headers: allHeaders,
          timeout: PUBLISH_TIMEOUT,
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
      if (this.chunkCounts[key]) {
        // it was chunked, so get rid of chunks
        for (let chunk = 1; chunk < this.chunkCounts[key]; chunk++) {
          await this.kv.delete(chunkedKey({ key, chunk }));
        }
        delete this.chunkCounts[key];
      }
    }
  };

  stats = (): { count: number; bytes: number } | undefined => {
    if (this.sizes == null) {
      return;
    }
    let count = 0;
    let bytes = 0;
    for (const key in this.sizes) {
      count += 1;
      bytes += this.sizes[key];
    }
    return { count, bytes };
  };

  // separated out from throttled version so it's easy to call directly for unit testing.
  private enforceLimitsNow = reuseInFlight(async () => {
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
    // console.log("enforceLimitsNow", this.limits, v, getTimes());
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
        const cutoff = new Date(now - max_age);
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
        // code 10071 is for "JetStreamApiError: wrong last sequence", which is
        // expected when there are multiple clients, since all of them try to impose
        // limits up at once.
        if (err.code != "TIMEOUT" && err.code != 10071) {
          console.log(`WARNING: expiring old messages - ${err}`);
        }
      }
    }
  });

  // ensure any limits are satisfied, always by deleting old keys
  private enforceLimits = throttle(
    this.enforceLimitsNow,
    ENFORCE_LIMITS_THROTTLE_MS,
    { leading: false, trailing: true },
  );
}

// Support for value chunking below

// **WARNING: Do not change these constants ever, or it will silently break
// all chunked kv and stream data that has ever been stored!!!**

const CHUNK = "chunk";
export const CHUNKS_HEADER = "CoCalc-Chunks";

function chunkedKey({ key, chunk }: { key: string; chunk?: number }) {
  return `${key}.${chunk}.${CHUNK}`;
}

function isChunkedKey(key: string) {
  return key.endsWith("." + CHUNK);
}

function getChunkCount(headers) {
  if (headers == null) {
    return 0;
  }
  for (const [key, value] of headers) {
    if (key == CHUNKS_HEADER) {
      return parseInt(value[0]);
    }
  }
  return 0;
}

function parseChunkedKey(key: string): {
  key: string;
  index: number;
} {
  if (!isChunkedKey(key)) {
    return { key, index: 0 };
  }
  const v = key.split(".");
  return {
    key: v.slice(0, v.length - 2).join("."),
    index: parseInt(v[v.length - 2]),
  };
}

// The put function built into jetstream doesn't support
// setting headers, but we set headers for doing chunking.
// So we have to rewrite their put.   I attempted to upstream this:
// https://github.com/nats-io/nats.js/issues/217
// This was explicitly soundly rejected by the NATS developers.
// It's thus important that we unit test this, which is done in
// packages/backend/nats/test/sync/chunk.test.ts
// right now. I think it is highly unlikely NATS will break using
// headers in some future version, based on how KV is implemented
// on top of lower level primitives.  However, if they do, we will
// fork whatever part of NATS that does, and maintain it.  The code
// is easy to work with and understand.

// Second, the put function in nats.js doesn't support setting a timeout,
// so that's another thing done below. Upstream:
//        https://github.com/nats-io/nats.js/issues/268
async function jetstreamPut(
  kv,
  k: string,
  data,
  opts: any = {},
): Promise<number> {
  const ek = kv.encodeKey(k);
  kv.validateKey(ek);

  const o = { timeout: opts.timeout } as any;
  if (opts.previousSeq !== undefined) {
    const h = createHeaders();
    o.headers = h;
    // PubHeaders.ExpectedLastSubjectSequenceHdr is 'Nats-Expected-Last-Subject-Sequence', but
    // PubHeaders is defined only internally to jetstream, so I copy/pasted this here.
    h.set("Nats-Expected-Last-Subject-Sequence", `${opts.previousSeq}`);
  }
  if (opts.headers !== undefined) {
    for (const [key, value] of opts.headers) {
      if (o.headers == null) {
        o.headers = createHeaders();
      }
      o.headers.set(key, value[0]);
    }
  }
  try {
    const pa = await kv.js.publish(kv.subjectForKey(ek, true), data, o);
    return pa.seq;
  } catch (err) {
    return Promise.reject(err);
  }
}

// see https://github.com/nats-io/nats.js/issues/246
// In particular, we need this just to be able to support
// base64 encoded keys!

// upstream is: /^[-/=.\w]+$/;

const validKeyRe = /^[^\u0000\s*>]+$/;
function validateKey(k: string) {
  if (k.startsWith(".") || k.endsWith(".") || !validKeyRe.test(k)) {
    throw new Error(`invalid key: ${k}`);
  }
}

// upstream is: /^[-/=.>*\w]+$/;
const validSearchKey = /^[^\u0000\s]+$/;
export function validateSearchKey(k: string) {
  if (k.startsWith(".") || k.endsWith(".") || !validSearchKey.test(k)) {
    throw new Error(`invalid key: ${k}`);
  }
}
