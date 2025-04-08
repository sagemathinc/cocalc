/*
Eventually Consistent Distributed Event Stream

DEVELOPMENT:


# in node -- note the package directory!!
~/cocalc/src/packages/backend n
Welcome to Node.js v18.17.1.
Type ".help" for more information.

> s = await require("@cocalc/backend/nats/sync").dstream({name:'test'});


> s = await require("@cocalc/backend/nats/sync").dstream({project_id:cc.current().project_id,name:'foo'});0


See the guide for dkv, since it's very similar, especially for use in a browser.

*/

import { EventEmitter } from "events";
import {
  Stream,
  type StreamOptions,
  type UserStreamOptions,
  userStreamOptionsKey,
  last,
} from "./stream";
import { jsName, streamSubject, randomId } from "@cocalc/nats/names";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { delay } from "awaiting";
import { map as awaitMap } from "awaiting";
import { isNumericString } from "@cocalc/util/misc";
import { millis } from "@cocalc/nats/util";
import refCache from "@cocalc/util/refcache";
import { type JsMsg } from "@nats-io/jetstream";
import { getEnv } from "@cocalc/nats/client";
import { inventory, THROTTLE_MS } from "./inventory";
import { asyncThrottle } from "@cocalc/util/async-utils";
import { getClient, type ClientWithState } from "@cocalc/nats/client";

const MAX_PARALLEL = 250;

export interface DStreamOptions extends StreamOptions {
  noAutosave?: boolean;
  noInventory?: boolean;
}

export class DStream<T = any> extends EventEmitter {
  public readonly name: string;
  private stream?: Stream;
  private messages: T[];
  private raw: JsMsg[][];
  private noAutosave: boolean;
  // TODO: using Map for these will be better because we use .length a bunch, which is O(n) instead of O(1).
  private local: { [id: string]: T } = {};
  private publishOptions: {
    [id: string]: { headers?: { [key: string]: string } };
  } = {};
  private saved: { [seq: number]: T } = {};
  private opts;
  private client?: ClientWithState;

  constructor(opts: DStreamOptions) {
    super();
    if (
      opts.noInventory ||
      (process.env.COCALC_TEST_MODE && opts.noInventory == null)
    ) {
      // @ts-ignore
      this.updateInventory = () => {};
    }
    this.opts = opts;
    this.noAutosave = !!opts.noAutosave;
    this.name = opts.name;
    this.stream = new Stream(opts);
    this.messages = this.stream.messages;
    this.raw = this.stream.raw;
    if (!this.noAutosave) {
      this.client = getClient();
      this.client.on("connected", this.save);
    }
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
    this.stream.on("change", (mesg: T, raw: JsMsg[]) => {
      delete this.saved[last(raw).seq];
      this.emit("change", mesg);
      if (this.isStable()) {
        this.emit("stable");
      }
    });
    await this.stream.init();
    this.emit("connected");
    this.updateInventory();
  });

  isStable = () => {
    for (const _ in this.saved) {
      return false;
    }
    for (const _ in this.local) {
      return false;
    }
    return true;
  };

  close = async () => {
    if (this.stream == null) {
      return;
    }
    if (!this.noAutosave) {
      this.client?.removeListener("connected", this.save);
      try {
        await this.save();
      } catch {
        // [ ] TODO: try localStorage or a file?!
      }
    }
    this.stream.close();
    this.emit("closed");
    this.removeAllListeners();
    delete this.stream;
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
      return last(this.raw[n])?.seq;
    }
    const v = Object.keys(this.saved);
    if (n < v.length + this.raw.length) {
      return parseInt(v[n - this.raw.length]);
    }
  };

  time = (n: number): Date | undefined => {
    const r = last(this.raw[n]);
    if (r == null) {
      return;
    }
    return new Date(millis(r?.info.timestampNanos));
  };

  get length(): number {
    return (
      this.messages.length +
      Object.keys(this.saved).length +
      Object.keys(this.local).length
    );
  }

  private toValue = (obj) => {
    if (this.stream == null) {
      throw Error("not initialized");
    }
    if (this.stream.valueType == "binary") {
      if (!ArrayBuffer.isView(obj)) {
        throw Error("value must be an array buffer");
      }
      return obj;
    }
    return this.opts.env.jc.decode(this.opts.env.jc.encode(obj));
  };

  publish = (
    mesg: T,
    // NOTE: if you call this.headers(n) it is NOT visible until the publish is confirmed.
    // This could be changed with more work if it matters.
    options?: { headers?: { [key: string]: string } },
  ): void => {
    const id = randomId();
    this.local[id] = this.toValue(mesg);
    if (options != null) {
      this.publishOptions[id] = options;
    }
    if (!this.noAutosave) {
      this.save();
    }
    this.updateInventory();
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
    let d = 100;
    while (true) {
      try {
        await this.attemptToSave();
        //console.log("successfully saved");
      } catch (err) {
        d = Math.min(10000, d * 1.3) + Math.random() * 100;
        await delay(d);
        // [ ] TODO: I do not like silently not dealing with this error!
        console.log("stream: attemptToSave failed", this.name, err);
      }
      if (!this.hasUnsavedChanges()) {
        return;
      }
    }
  });

  private attemptToSave = reuseInFlight(async () => {
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
        if ((last(this.raw[this.raw.length - 1])?.seq ?? -1) < seq) {
          // it still isn't in this.raw
          this.saved[seq] = mesg;
        }
        delete this.local[id];
        delete this.publishOptions[id];
      } catch (err) {
        if (err.code == "REJECT") {
          delete this.local[id];
          // err has mesg and subject set.
          this.emit("reject", { err, mesg });
        } else {
          throw err;
        }
      }
      if (this.isStable()) {
        this.emit("stable");
      }
    };
    // NOTE: ES6 spec guarantees "String keys are returned in the order
    // in which they were added to the object."
    const ids = Object.keys(this.local);
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
  // then purges the stream stored in nats.
  // NOTE: other clients will NOT see the result of a purge (unless they reconnect).
  purge = async (opts?) => {
    await this.save();
    if (this.stream == null) {
      throw Error("not initialized");
    }
    await this.stream.purge(opts);
  };

  get start_seq(): number | undefined {
    return this.stream?.start_seq;
  }

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
      try {
        const curSeq = this.getCurSeq();
        if (!curSeq) {
          // we know nothing
          return;
        }
        const { account_id, project_id, desc, limits } = this.opts;
        const inv = await inventory({ account_id, project_id });
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
        console.log(
          `WARNING: unable to update inventory.  name='${this.opts.name}':`,
          err,
        );
      }
    },
    THROTTLE_MS,
    { leading: true, trailing: true },
  );
}

const cache = refCache<UserStreamOptions, DStream>({
  createKey: userStreamOptionsKey,
  createObject: async (options) => {
    if (options.env == null) {
      options.env = await getEnv();
    }
    const { account_id, project_id, name, valueType = "json" } = options;
    const jsname = jsName({ account_id, project_id });
    const subjects = streamSubject({ account_id, project_id });

    // **CRITICAL:** do NOT change how the filter is computed as a function
    // of options unless it is backwards compatible, or all user data
    // involving streams will just go poof!
    const uniqueFilter = JSON.stringify([name, valueType]);
    const filter = subjects.replace(">", btoa(uniqueFilter));
    const dstream = new DStream({
      ...options,
      name,
      jsname,
      subjects,
      subject: filter,
      filter,
    });
    await dstream.init();
    return dstream;
  },
});

export async function dstream<T>(
  options: UserStreamOptions,
): Promise<DStream<T>> {
  return await cache(options);
}
