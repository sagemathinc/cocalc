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
import { sha1 } from "@cocalc/util/misc";
import { millis } from "@cocalc/nats/util";
import refCache from "@cocalc/util/refcache";
import { type JsMsg } from "@nats-io/jetstream";
import { getEnv } from "@cocalc/nats/client";
import { inventory, THROTTLE_MS } from "./inventory";
import { throttle } from "lodash";
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
    });
    await this.stream.init();
    this.emit("connected");
  });

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

  publish = (mesg: T): void => {
    const id = randomId();
    this.local[id] = mesg;
    if (!this.noAutosave) {
      this.save();
    }
    this.updateInventory();
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
      } catch (_err) {
        d = Math.min(10000, d * 1.3) + Math.random() * 100;
        await delay(d);
        // [ ] TODO: I do not like silently not dealing with this error!
        //console.log("problem saving", err);
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
        const { seq } = await this.stream.publish(mesg, { msgID: id });
        if ((last(this.raw[this.raw.length - 1])?.seq ?? -1) < seq) {
          // it still isn't in this.raw
          this.saved[seq] = mesg;
        }
        delete this.local[id];
      } catch (err) {
        if (err.code == "REJECT") {
          delete this.local[id];
          // err has mesg and subject set.
          this.emit("reject", err);
        } else {
          throw err;
        }
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

  private updateInventory = throttle(
    async () => {
      if (this.stream == null || this.opts.noInventory) {
        return;
      }
      try {
        const { account_id, project_id, desc } = this.opts;
        const inv = await inventory({ account_id, project_id });
        const name = this.opts.name;
        if (!inv.needsUpdate({ name, type: "stream" })) {
          return;
        }
        const stats = this.stream.stats();
        if (stats == null) {
          return;
        }
        const { count, bytes } = stats;
        inv.set({ type: "stream", name, count, bytes, desc });
      } catch (err) {
        console.log(
          "WARNING: unable to update inventory for ",
          this.opts.name,
          err,
        );
      }
    },
    THROTTLE_MS,
    { leading: false, trailing: true },
  );
}

const cache = refCache<UserStreamOptions, DStream>({
  createKey: userStreamOptionsKey,
  createObject: async (options) => {
    if (options.env == null) {
      options.env = await getEnv();
    }
    const { account_id, project_id, name } = options;
    const jsname = jsName({ account_id, project_id });
    const subjects = streamSubject({ account_id, project_id });
    const filter = subjects.replace(">", (options.env.sha1 ?? sha1)(name));
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
