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

const MAX_PARALLEL = 50;

export class DStream extends EventEmitter {
  public readonly name: string;
  private stream?: Stream;
  private messages: any[];
  private raw: any[];
  private local: { [id: string]: { mesg: any; subject?: string } } = {};

  constructor(opts: StreamOptions) {
    super();
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
    this.stream.on("change", (...args) => {
      this.emit("change", ...args);
    });
    await this.stream.init();
    this.emit("connected");
  });

  close = () => {
    if (this.stream == null) {
      return;
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
    if (n == null) {
      return [
        ...this.messages,
        ...Object.values(this.local).map((x) => x.mesg),
      ];
    } else {
      return (
        this.messages[n] ??
        Object.values(this.local)[n - this.messages.length]?.mesg
      );
    }
  };

  // sequence number of n-th message
  seq = (n) => {
    return this.raw[n]?.seq;
  };

  get length() {
    return this.messages.length + Object.keys(this.local).length;
  }

  publish = (mesg, subject?: string) => {
    const id = randomId();
    this.local[id] = { mesg, subject };
    this.save();
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
    return Object.values(this.local);
  };

  private save = reuseInFlight(async () => {
    let d = 100;
    while (true) {
      try {
        await this.attemptToSave();
        //console.log("successfully saved");
      } catch {
        //(err) {
        // console.log("problem saving", err);
      }
      if (this.hasUnsavedChanges()) {
        d = Math.min(10000, d * 1.3) + Math.random() * 100;
        await delay(d);
      } else {
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
        await this.stream.publish(mesg, subject, { msgID: id });
        delete this.local[id];
      } catch (err) {
        if (err.code == "REJECT") {
          delete this.local[id];
          this.emit("reject", err.mesg, err.subject);
        } else {
          throw err;
        }
      }
    };
    // NOTE: ES6 spec guarantees "String keys are returned in the order
    // in which they were added to the object."
    await awaitMap(Object.keys(this.local), MAX_PARALLEL, f);
  });

  load = async (opts) => {
    if (this.stream == null) {
      throw Error("closed");
    }
    await this.stream.load(opts);
  };
}

const dstreamCache: { [key: string]: DStream } = {};
export const dstream = reuseInFlight(
  async (options: UserStreamOptions) => {
    const { account_id, project_id, name } = options;
    const jsname = jsName({ account_id, project_id });
    const subjects = streamSubject({ account_id, project_id });
    const filter = subjects.replace(">", (options.env.sha1 ?? sha1)(name));
    const key = userStreamOptionsKey(options);
    if (dstreamCache[key] == null) {
      const dstream = new DStream({
        ...options,
        name,
        jsname,
        subjects,
        subject: filter,
        filter,
      });
      await dstream.init();
      dstreamCache[key] = dstream;
      dstream.on("closed", () => {
        delete dstreamCache[key];
      });
    }
    return dstreamCache[key];
  },
  {
    createKey: (args) => userStreamOptionsKey(args[0]),
  },
);
