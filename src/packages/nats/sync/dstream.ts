/*
Eventually Consistent Distributed Event Stream

DEVELOPMENT:


# in node:
> env = await require("@cocalc/backend/nats/env").getEnv()
 a = require("@cocalc/nats/sync/dstream"); s = await a.dstream({project_id:'56eb622f-d398-489a-83ef-c09f1a1e8094',name:'foo', env})


*/

import { EventEmitter } from "events";
import { Stream, type StreamOptions, type UserStreamOptions } from "./stream";
import { jsName, streamSubject, randomId } from "@cocalc/nats/names";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { type JSONValue } from "@cocalc/util/types";
import { delay } from "awaiting";
import { map as awaitMap } from "awaiting";
const MAX_PARALLEL = 50;

export class DStream extends EventEmitter {
  private stream?: Stream;
  private events: JSONValue[];
  private raw: any[];
  private local: { [id: string]: { event: JSONValue; subject?: string } } = {};

  constructor(opts: StreamOptions) {
    super();
    this.stream = new Stream(opts);
    this.events = this.stream.events;
    this.raw = this.stream.raw;
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
    delete this.events;
    // @ts-ignore
    delete this.raw;
  };

  publish = (event: JSONValue, subject?: string) => {
    const id = randomId();
    this.local[id] = { event, subject };
    this.save();
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
      const { event, subject } = this.local[id];
      // @ts-ignore
      await this.stream.publish(event, subject, { msgID: id });
      delete this.local[id];
    };
    await awaitMap(Object.keys(this.local), MAX_PARALLEL, f);
  });
}

const dstreamCache: { [key: string]: DStream } = {};
export const dstream = reuseInFlight(
  async ({ env, account_id, project_id, name }: UserStreamOptions) => {
    const jsname = jsName({ account_id, project_id });
    const subjects = streamSubject({ account_id, project_id });
    const filter = subjects.replace(">", name);
    const key = JSON.stringify([name, jsname]);
    if (dstreamCache[key] == null) {
      const dstream = new DStream({
        name: jsname,
        subjects,
        subject: filter,
        filter,
        env,
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
    createKey: (args) =>
      JSON.stringify([args[0].account_id, args[0].project_id, args[0].name]),
  },
);
