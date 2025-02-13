/*
Eventually Consistent Distributed Event Stream

DEVELOPMENT:


# in node -- note the package directory!!
~/cocalc/src/packages/backend n
Welcome to Node.js v18.17.1.
Type ".help" for more information.

> s = await require("@cocalc/backend/nats/sync").dstream({name:'test'});


> s = await require("@cocalc/backend/nats/sync").dstream({project_id:'56eb622f-d398-489a-83ef-c09f1a1e8094',name:'foo'});0


*/

import { EventEmitter } from "events";
import {
  Stream,
  type StreamOptions,
  type UserStreamOptions,
  userStreamOptionsKey,
} from "./stream";
import { jsName, streamSubject, randomId } from "@cocalc/nats/names";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { delay } from "awaiting";
import { map as awaitMap } from "awaiting";
import { isNumericString } from "@cocalc/util/misc";
import { sha1 } from "@cocalc/util/misc";
import { millis } from "@cocalc/nats/util";

const MAX_PARALLEL = 250;

export interface DStreamOptions extends StreamOptions {
  noAutosave?: boolean;
}

export class DStream extends EventEmitter {
  public readonly name: string;
  private stream?: Stream;
  private messages: any[];
  private raw: any[];
  private noAutosave: boolean;
  // TODO: using Map for these will be better because we use .length a bunch, which is O(n) instead of O(1).
  private local: { [id: string]: { mesg: any; subject?: string } } = {};
  private saved: { [seq: number]: any } = {};

  constructor(opts: DStreamOptions) {
    super();
    this.noAutosave = !!opts.noAutosave;
    this.name = opts.name;
    this.stream = new Stream(opts);
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
    this.stream.on("change", (mesg, raw) => {
      delete this.saved[raw.seq];
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
      await this.save();
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

  get = (n?) => {
    if (this.stream == null) {
      throw Error("closed");
    }
    if (n == null) {
      return [
        ...this.messages,
        ...Object.values(this.saved),
        ...Object.values(this.local).map((x) => x.mesg),
      ];
    } else {
      if (n < this.messages.length) {
        return this.messages[n];
      }
      const v = Object.keys(this.saved);
      if (n < v.length + this.messages.length) {
        return v[n - this.messages.length];
      }
      return Object.values(this.local)[n - this.messages.length - v.length]
        ?.mesg;
    }
  };

  // sequence number of n-th message
  seq = (n) => {
    if (n < this.raw.length) {
      return this.raw[n]?.seq;
    }
    const v = Object.keys(this.saved);
    if (n < v.length + this.raw.length) {
      return parseInt(v[n - this.raw.length]);
    }
  };

  time = (n) => {
    const r = this.raw[n];
    if (r == null) {
      return;
    }
    return new Date(millis(r?.info.timestampNanos));
  };

  get length() {
    return (
      this.messages.length +
      Object.keys(this.saved).length +
      Object.keys(this.local).length
    );
  }

  publish = (mesg, subject?: string) => {
    const id = randomId();
    this.local[id] = { mesg, subject };
    if (!this.noAutosave) {
      this.save();
    }
  };

  push = (...args) => {
    if (this.stream == null) {
      throw Error("closed");
    }
    for (const mesg of args) {
      this.publish(mesg);
    }
  };

  hasUnsavedChanges = () => {
    if (this.stream == null) {
      return false;
    }
    return Object.keys(this.local).length > 0;
  };

  unsavedChanges = () => {
    return Object.values(this.local).map(({ mesg }) => mesg);
  };

  save = reuseInFlight(async () => {
    let d = 100;
    while (true) {
      try {
        await this.attemptToSave();
        //console.log("successfully saved");
      } catch {
        d = Math.min(10000, d * 1.3) + Math.random() * 100;
        await delay(d);
        //(err) {
        // console.log("problem saving", err);
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
      const { mesg, subject } = this.local[id];
      try {
        // @ts-ignore
        const { seq } = await this.stream.publish(mesg, subject, { msgID: id });
        if ((this.raw[this.raw.length - 1]?.seq ?? -1) < seq) {
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
    const t = Date.now();
    await awaitMap(ids, MAX_PARALLEL, f);
    console.log(
      `saving ${ids.length} messages ${MAX_PARALLEL} at once took `,
      Date.now() - t,
    );
  });

  // load older messages starting at start_seq
  load = async (opts: { start_seq: number }) => {
    if (this.stream == null) {
      throw Error("closed");
    }
    await this.stream.load(opts);
  };
}

const dstreamCache: { [key: string]: DStream } = {};
export const dstream = reuseInFlight(
  async (
    options: UserStreamOptions,
    { noCache }: { noCache?: boolean } = {},
  ) => {
    const { account_id, project_id, name } = options;
    const jsname = jsName({ account_id, project_id });
    const subjects = streamSubject({ account_id, project_id });
    const filter = subjects.replace(">", (options.env.sha1 ?? sha1)(name));
    const f = async () => {
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
    };
    if (noCache) {
      // especially useful for unit testing.
      return await f();
    }

    const key = userStreamOptionsKey(options);
    if (dstreamCache[key] == null) {
      const dstream = await f();
      dstreamCache[key] = dstream;
      dstream.on("closed", () => {
        delete dstreamCache[key];
      });
    }
    return dstreamCache[key];
  },
  {
    createKey: (args) =>
      userStreamOptionsKey(args[0]) + JSON.stringify(args[1]),
  },
);
