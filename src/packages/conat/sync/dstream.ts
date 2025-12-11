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
import { delay, map as awaitMap } from "awaiting";
import { asyncThrottle, until } from "@cocalc/util/async-utils";
import {
  inventory,
  type Inventory,
  INVENTORY_UPDATE_INTERVAL,
} from "./inventory";
import { getLogger } from "@cocalc/conat/client";

const logger = getLogger("sync:dstream");

export interface DStreamOptions {
  // what it's called by us
  name: string;
  account_id?: string;
  project_id?: string;
  host_id?: string;
  config?: Partial<Configuration>;
  // only load historic messages starting at the given seq number.
  start_seq?: number;
  desc?: JSONValue;

  client?: Client;
  noAutosave?: boolean;
  ephemeral?: boolean;
  sync?: boolean;

  noCache?: boolean;
  noInventory?: boolean;

  service?: string;
}

export class DStream<T = any> extends EventEmitter {
  public readonly name: string;
  private stream: CoreStream;
  private messages: T[];
  private raw: RawMsg[];
  private noAutosave: boolean;
  // TODO: using Map for these will be better because we use .length a bunch, which is O(n) instead of O(1).
  private local: { [id: string]: T } = {};
  private publishOptions: {
    [id: string]: { headers?: Headers };
  } = {};
  private saved: { [seq: number]: T } = {};
  private opts: DStreamOptions;

  constructor(opts: DStreamOptions) {
    super();
    logger.debug("constructor", opts.name);
    if (opts.client == null) {
      throw Error("client must be specified");
    }
    this.opts = opts;
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

  private initialized = false;
  init = async () => {
    if (this.initialized) {
      throw Error("init can only be called once");
    }
    this.initialized = true;
    if (this.isClosed()) {
      throw Error("closed");
    }
    this.stream.on("change", this.handleChange);
    this.stream.on("reset", () => {
      this.local = {};
      this.saved = {};
    });
    await this.stream.init();
    this.emit("connected");
  };

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
    this.emit("change", mesg, raw?.seq);
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

  isClosed = () => {
    return this.stream == null;
  };

  close = () => {
    if (this.isClosed()) {
      return;
    }
    logger.debug("close", this.name);
    const stream = this.stream;
    stream.removeListener("change", this.handleChange);
    // @ts-ignore
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
    // @ts-ignore
    delete this.opts;
  };

  get = (n?): T | T[] => {
    if (this.isClosed()) {
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
    if (this.isClosed()) {
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

  // all sequences numbers of messages
  seqs = (): number[] => {
    const seqs = this.raw.map(({ seq }) => seq);
    for (const seq in this.saved) {
      seqs.push(parseInt(seq));
    }
    return seqs;
  };

  time = (n: number): Date | undefined => {
    if (this.isClosed()) {
      throw Error("not initialized");
    }
    return this.stream.time(n);
  };

  // all server assigned times of messages in the stream.
  times = (): (Date | undefined)[] => {
    if (this.isClosed()) {
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
    this.updateInventory();
  };

  headers = (n) => {
    if (this.isClosed()) {
      throw Error("closed");
    }
    return this.stream.headers(n);
  };

  push = (...args: T[]) => {
    if (this.isClosed()) {
      throw Error("closed");
    }
    for (const mesg of args) {
      this.publish(mesg);
    }
  };

  hasUnsavedChanges = (): boolean => {
    if (this.isClosed()) {
      return false;
    }
    return Object.keys(this.local).length > 0;
  };

  unsavedChanges = (): T[] => {
    return Object.values(this.local);
  };

  save = reuseInFlight(async () => {
    //console.log("save", this.noAutosave);
    await until(
      async () => {
        if (this.isClosed()) {
          return true;
        }
        try {
          await this.attemptToSave();
          //console.log("successfully saved");
        } catch (err) {
          if (false && !process.env.COCALC_TEST_MODE) {
            console.log(
              `WARNING: dstream attemptToSave failed - ${err}`,
              this.name,
            );
          }
        }
        return !this.hasUnsavedChanges();
      },
      { start: 150, decay: 1.3, max: 10000 },
    );
  });

  private attemptToSave = async () => {
    if (true) {
      await this.attemptToSaveBatch();
    } else {
      await this.attemptToSaveParallel();
    }
  };

  private attemptToSaveBatch = reuseInFlight(async () => {
    if (this.isClosed()) {
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

    if (this.isClosed()) {
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
          console.warn(
            `WARNING -- error saving dstream '${this.name}' -- ${w[i].error}`,
          );
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
      throw Error(`there were errors saving dstream '${this.name}'`);
    }
  });

  // non-batched version
  private attemptToSaveParallel = reuseInFlight(async () => {
    const f = async (id) => {
      if (this.isClosed()) {
        throw Error("closed");
      }
      const mesg = this.local[id];
      try {
        // @ts-ignore
        const { seq } = await this.stream.publish(mesg, {
          ...this.publishOptions[id],
          msgID: id,
        });
        if (this.isClosed()) {
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
          if (!process.env.COCALC_TEST_MODE) {
            console.warn(
              `WARNING: problem saving dstream ${this.name} -- ${err}`,
            );
          }
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
    if (this.isClosed()) {
      throw Error("closed");
    }
    await this.stream.load(opts);
  };

  // this is not synchronous -- it makes sure everything is saved out,
  // then delete the persistent stream
  // NOTE: for ephemeral streams, other clients will NOT see the result of a delete (unless they reconnect).
  delete = async (opts?) => {
    await this.save();
    if (this.isClosed()) {
      throw Error("closed");
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
    if (this.isClosed()) {
      throw Error("closed");
    }
    return await this.stream.config(config);
  };

  private updateInventory = asyncThrottle(
    async () => {
      if (this.isClosed() || this.opts == null || this.opts.noInventory) {
        return;
      }
      await delay(500);
      if (this.isClosed()) {
        return;
      }
      let inv: Inventory | undefined = undefined;
      try {
        const { account_id, project_id, desc } = this.opts;
        const inv = await inventory({
          account_id,
          project_id,
          service: this.opts.service,
        });
        if (this.isClosed()) {
          return;
        }
        const status = {
          type: "stream" as "stream",
          name: this.opts.name,
          desc,
          ...(await this.stream.inventory()),
        };
        inv.set(status);
      } catch (err) {
        if (!process.env.COCALC_TEST_MODE) {
          console.log(
            `WARNING: unable to update inventory.  name='${this.opts.name} -- ${err}'`,
          );
        }
      } finally {
        // @ts-ignore
        inv?.close();
      }
    },
    INVENTORY_UPDATE_INTERVAL,
    { leading: true, trailing: true },
  );
}

export const cache = refCache<DStreamOptions, DStream>({
  name: "dstream",
  createKey: (options: DStreamOptions) => {
    if (!options.name) {
      throw Error("name must be specified");
    }
    const { name, account_id, project_id, client } = options;
    const id = client?.id;
    return jsonStableStringify({ name, account_id, project_id, id })!;
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
