/*
Eventually Consistent Distributed Message Stream

DEVELOPMENT:


# in node -- note the package directory!!
~/cocalc/src/packages/backend node

> s = await require("@cocalc/backend/conat/sync").dstream({name:'test'});
> s = await require("@cocalc/backend/conat/sync").dstream({project_id:cc.current().project_id,name:'foo'});0

See the guide for dkv, since it's very similar, especially for use in a browser.
*/

import { EventEmitter } from "events";
import {
  CoreStream,
  type RawMsg,
  type ChangeEvent,
  type PublishOptions,
} from "./core-stream";
import { randomId } from "@cocalc/conat/names";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { delay } from "awaiting";
import { isNumericString } from "@cocalc/util/misc";
import refCache from "@cocalc/util/refcache";
import {
  type Client,
  type Headers,
  ConatError,
} from "@cocalc/conat/core/client";
import jsonStableStringify from "json-stable-stringify";
import type { JSONValue } from "@cocalc/util/types";
import { Configuration } from "./core-stream";
import { conat } from "@cocalc/conat/client";
import { map as awaitMap } from "awaiting";

export interface DStreamOptions {
  // what it's called by us
  name: string;
  account_id?: string;
  project_id?: string;
  config?: Partial<Configuration>;
  // only load historic messages starting at the given seq number.
  start_seq?: number;
  desc?: JSONValue;

  client?: Client;
  noAutosave?: boolean;
  ephemeral?: boolean;
  lifetime?: number; // for ephemeral streams

  noCache?: boolean;
  noInventory?: boolean;
}

export class DStream<T = any> extends EventEmitter {
  public readonly name: string;
  private stream?: CoreStream;
  private messages: T[];
  private raw: RawMsg[];
  private noAutosave: boolean;
  // TODO: using Map for these will be better because we use .length a bunch, which is O(n) instead of O(1).
  private local: { [id: string]: T } = {};
  private publishOptions: {
    [id: string]: { headers?: Headers };
  } = {};
  private saved: { [seq: number]: T } = {};

  constructor(opts: DStreamOptions) {
    super();
    if (opts.client == null) {
      throw Error("client must be specified");
    }
    this.noAutosave = !!opts.noAutosave;
    this.name = opts.name;
    this.stream = new CoreStream(opts);
    this.messages = this.stream.messages;
    this.raw = this.stream.raw;
    return new Proxy(this, {
      get(target, prop) {
        return typeof prop == "string" && isNumericString(prop)
          ? target.get(parseInt(prop))
          : target[String(prop)];
      },
    });
  }

  init = reuseInFlight(async () => {
    if (this.stream == null) {
      throw Error("closed");
    }
    this.stream.on("change", this.handleChange);
    this.stream.on("reset", () => {
      this.local = {};
      this.saved = {};
    });
    await this.stream.init();
    this.emit("connected");
  });

  private handleChange = ({ mesg, raw, msgID }: ChangeEvent<T>) => {
    if (raw?.seq !== undefined) {
      delete this.saved[raw.seq];
    }
    if (mesg === undefined) {
      return;
    }
    if (msgID) {
      // this is critical with core-stream.ts, since otherwise there is a moment
      // when the same message is in both this.local *and* this.messages, and you'll
      // see it doubled in this.getAll().
      delete this.local[msgID];
    }
    this.emit("change", mesg);
    if (this.isStable()) {
      this.emit("stable");
    }
  };

  isStable = () => {
    for (const _ in this.saved) {
      return false;
    }
    for (const _ in this.local) {
      return false;
    }
    return true;
  };

  close = () => {
    if (this.stream == null) {
      return;
    }
    const stream = this.stream;
    stream.removeListener("change", this.handleChange);
    delete this.stream;
    stream.close();
    this.emit("closed");
    this.removeAllListeners();
    // @ts-ignore
    delete this.local;
    // @ts-ignore
    delete this.messages;
    // @ts-ignore
    delete this.raw;
  };

  get = (n?): T | T[] => {
    if (this.stream == null) {
      throw Error("closed");
    }
    if (n == null) {
      return this.getAll();
    } else {
      if (n < this.messages.length) {
        return this.messages[n];
      }
      const v = Object.keys(this.saved);
      if (n < v.length + this.messages.length) {
        return this.saved[n - this.messages.length];
      }
      return Object.values(this.local)[n - this.messages.length - v.length];
    }
  };

  getAll = (): T[] => {
    if (this.stream == null) {
      throw Error("closed");
    }
    return [
      ...this.messages,
      ...Object.values(this.saved),
      ...Object.values(this.local),
    ];
  };

  // sequence number of n-th message
  seq = (n: number): number | undefined => {
    if (n < this.raw.length) {
      return this.raw[n].seq;
    }
    const v = Object.keys(this.saved);
    if (n < v.length + this.raw.length) {
      return parseInt(v[n - this.raw.length]);
    }
  };

  time = (n: number): Date | undefined => {
    if (this.stream == null) {
      throw Error("not initialized");
    }
    return this.stream.time(n);
  };

  // all server assigned times of messages in the stream.
  times = (): (Date | undefined)[] => {
    if (this.stream == null) {
      throw Error("not initialized");
    }
    return this.stream.times();
  };

  get length(): number {
    return (
      this.messages.length +
      Object.keys(this.saved).length +
      Object.keys(this.local).length
    );
  }

  publish = (
    mesg: T,
    // NOTE: if you call this.headers(n) it is NOT visible until
    // the publish is confirmed. This could be changed with more work if it matters.
    options?: { headers?: Headers; ttl?: number },
  ): void => {
    const id = randomId();
    this.local[id] = mesg;
    if (options != null) {
      this.publishOptions[id] = options;
    }
    if (!this.noAutosave) {
      this.save();
    }
  };

  headers = (n) => {
    if (this.stream == null) {
      throw Error("closed");
    }
    return this.stream.headers(n);
  };

  push = (...args: T[]) => {
    if (this.stream == null) {
      throw Error("closed");
    }
    for (const mesg of args) {
      this.publish(mesg);
    }
  };

  hasUnsavedChanges = (): boolean => {
    if (this.stream == null) {
      return false;
    }
    return Object.keys(this.local).length > 0;
  };

  unsavedChanges = (): T[] => {
    return Object.values(this.local);
  };

  save = reuseInFlight(async () => {
    let d = 1000;
    while (true) {
      try {
        await this.attemptToSave();
        //console.log("successfully saved");
      } catch (err) {
        d = Math.min(10000, d * 1.3) + Math.random() * 100;
        await delay(d);
        if (!process.env.COCALC_TEST_MODE) {
          console.warn(
            `WARNING: stream attemptToSave failed -- ${err}`,
            this.name,
          );
        }
      }
      if (!this.hasUnsavedChanges()) {
        return;
      }
    }
  });

  private attemptToSave = async () => {
    if (true) {
      await this.attemptToSaveBatch();
    } else {
      await this.attemptToSaveParallel();
    }
  };

  private attemptToSaveBatch = reuseInFlight(async () => {
    if (this.stream == null) {
      throw Error("closed");
    }
    const v: { mesg: T; options: PublishOptions }[] = [];
    const ids = Object.keys(this.local);
    for (const id of ids) {
      const mesg = this.local[id];
      const options = {
        ...this.publishOptions[id],
        msgID: id,
      };
      v.push({ mesg, options });
    }
    const w: (
      | { seq: number; time: number; error?: undefined }
      | { error: string; code?: any }
    )[] = await this.stream.publishMany(v);

    if (this.raw == null) {
      return;
    }

    let errors = false;
    for (let i = 0; i < w.length; i++) {
      const id = ids[i];
      if (w[i].error) {
        const x = w[i] as { error: string; code?: any };
        if (x.code == "reject") {
          delete this.local[id];
          const err = new ConatError(x.error, { code: x.code });
          // err has mesg and subject set.
          this.emit("reject", { err, mesg: v[i].mesg });
        }
        if (!process.env.COCALC_TEST_MODE) {
          console.warn(`WARNING -- error publishing -- ${w[i].error}`);
        }
        errors = true;
        continue;
      }
      const { seq } = w[i] as { seq: number };
      if ((this.raw[this.raw.length - 1]?.seq ?? -1) < seq) {
        // it still isn't in this.raw
        this.saved[seq] = v[i].mesg;
      }
      delete this.local[id];
      delete this.publishOptions[id];
    }
    if (errors) {
      throw Error("there were errors saving");
    }
  });

  // non-batched version
  private attemptToSaveParallel = reuseInFlight(async () => {
    const f = async (id) => {
      if (this.stream == null) {
        throw Error("closed");
      }
      const mesg = this.local[id];
      try {
        // @ts-ignore
        const { seq } = await this.stream.publish(mesg, {
          ...this.publishOptions[id],
          msgID: id,
        });
        if (this.raw == null) {
          return;
        }
        if ((this.raw[this.raw.length - 1]?.seq ?? -1) < seq) {
          // it still isn't in this.raw
          this.saved[seq] = mesg;
        }
        delete this.local[id];
        delete this.publishOptions[id];
      } catch (err) {
        if (err.code == "reject") {
          delete this.local[id];
          // err has mesg and subject set.
          this.emit("reject", { err, mesg });
        } else {
          console.log(`WARNING: problem saving -- ${err}`);
        }
      }
      if (this.isStable()) {
        this.emit("stable");
      }
    };
    // NOTE: ES6 spec guarantees "String keys are returned in the order
    // in which they were added to the object."
    const ids = Object.keys(this.local);
    const MAX_PARALLEL = 50;
    await awaitMap(ids, MAX_PARALLEL, f);
  });

  // load older messages starting at start_seq
  load = async (opts: { start_seq: number }) => {
    if (this.stream == null) {
      throw Error("closed");
    }
    await this.stream.load(opts);
  };

  // this is not synchronous -- it makes sure everything is saved out,
  // then delete the persistent stream
  // NOTE: for ephemeral streams, other clients will NOT see the result of a purge (unless they reconnect).
  delete = async (opts?) => {
    await this.save();
    if (this.stream == null) {
      throw Error("not initialized");
    }
    return await this.stream.delete(opts);
  };

  get start_seq(): number | undefined {
    return this.stream?.start_seq;
  }

  // get or set config
  config = async (
    config: Partial<Configuration> = {},
  ): Promise<Configuration> => {
    if (this.stream == null) {
      throw Error("not initialized");
    }
    return await this.stream.config(config);
  };

  /*
    // returns largest sequence number known to this client.
  // not optimized to be super fast.
  private getCurSeq = (): number | undefined => {
    let s = 0;
    if (this.raw.length > 0) {
      s = Math.max(s, this.seq(this.raw.length - 1)!);
    }
    for (const t in this.saved) {
      const x = parseInt(t);
      if (x > s) {
        s = x;
      }
    }
    return s ? s : undefined;
  };

  // [ ] TODO: this will be moved to persistence server, which is where it belongs.
  private updateInventory = asyncThrottle(
    async () => {
      if (this.stream == null || this.opts.noInventory) {
        return;
      }
      await delay(500);
      if (this.stream == null) {
        return;
      }
      const name = this.name;
      const { valueType } = this.opts;
      let inv: null | Inventory = null;
      try {
        const curSeq = this.getCurSeq();
        if (!curSeq) {
          // we know nothing
          return;
        }
        const { account_id, project_id, desc, limits } = this.opts;
        inv = await inventory({ account_id, project_id });
        if (this.stream == null) {
          return;
        }
        if (!inv.needsUpdate({ name, type: "stream", valueType })) {
          return;
        }

        const cur = inv.get({ type: "stream", name, valueType });
        // last update gave info for everything up to and including seq.
        const seq = cur?.seq ?? 0;
        if (seq + 1 < (this.start_seq ?? 1)) {
          // We know data starting at start_seq, but this is strictly
          // too far along the sequence.
          throw Error("not enough sequence data to update inventory");
        }

        // [ ] TODO: need to take into account cur.seq in computing stats!

        const stats = this.stream?.stats({ start_seq: seq + 1 });
        if (stats == null) {
          return;
        }
        const { count, bytes } = stats;

        inv.set({
          type: "stream",
          name,
          valueType,
          count: count + (cur?.count ?? 0),
          bytes: bytes + (cur?.bytes ?? 0),
          desc,
          limits,
          seq: curSeq,
        });
      } catch (err) {
        logger.debug(
          `WARNING: unable to update inventory.  name='${this.opts.name} -- ${err}'`,
        );
      } finally {
        await inv?.close();
      }
    },
    THROTTLE_MS,
    { leading: true, trailing: true },
  );
  */
}

export const cache = refCache<DStreamOptions, DStream>({
  name: "dstream",
  createKey: (options: DStreamOptions) => {
    if (!options.name) {
      throw Error("name must be specified");
    }
    const { name, account_id, project_id } = options;
    return jsonStableStringify({ name, account_id, project_id })!;
  },
  createObject: async (options: DStreamOptions) => {
    if (options.client == null) {
      options = { ...options, client: await conat() };
    }
    const dstream = new DStream(options);
    await dstream.init();
    return dstream;
  },
});

export async function dstream<T>(options: DStreamOptions): Promise<DStream<T>> {
  return await cache(options);
}
