/*
Consistent Centralized Event Stream

TODO:
 - ability to easily initialize with only the last n messages or
   only messages going back to time t
 - automatically delete data according to various rules, e.g., needed
   for terminal, but

DEVELOPMENT:

~/cocalc/src/packages/server$ n
Welcome to Node.js v18.17.1.
Type ".help" for more information.
> env = await require("@cocalc/backend/nats/env").getEnv(); a = require("@cocalc/nats/sync/stream"); s = new a.Stream({name:'test',env,subjects:'foo',filter:'foo'}); await s.init();


With browser client using a project:

# in browser
> s = await cc.client.nats_client.stream({project_id:'56eb622f-d398-489a-83ef-c09f1a1e8094',name:'foo'})

# in node:
> env = await require("@cocalc/backend/nats/env").getEnv(); a = require("@cocalc/nats/sync/stream"); s = await a.stream({project_id:'56eb622f-d398-489a-83ef-c09f1a1e8094',name:'foo', env})


*/

import { EventEmitter } from "events";
import { type NatsEnv } from "@cocalc/nats/types";
import { jetstreamManager, jetstream } from "@nats-io/jetstream";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { jsName, streamSubject } from "@cocalc/nats/names";
import { nanos } from "@cocalc/nats/util";
import { delay } from "awaiting";

// confirm that ephemeral consumer still exists every 15 seconds:
// In case of a long disconnect from the network, this is what
// ensures we successfully get properly updated.
const CONSUMER_MONITOR_INTERVAL = 15 * 1000;

// Have server keep ephemeral consumers alive for an hour.  This
// means even if we drop from the internet for up to an hour, the server
// doesn't forget about our consumer.  But even if we are forgotten,
// the CONSUMER_MONITOR_INTERVAL ensures the event stream correctly works!
const EPHEMERAL_CONSUMER_THRESH = 60 * 60 * 1000;

export interface StreamOptions {
  name: string;
  // subject = default subject used for publishing; defaults to filter if filter doesn't have any wildcard
  subjects: string | string[];
  subject?: string;
  filter?: string;
  env: NatsEnv;
  options?;
}

export class Stream extends EventEmitter {
  public readonly name: string;
  private options?;
  private subjects: string | string[];
  private filter?: string;
  private subject?: string;
  private env: NatsEnv;
  private js;
  private stream?;
  private watch?;
  // don't do "this.raw=" or "this.events=" anywhere in this class!
  public readonly raw: any[] = [];
  public readonly events: any[] = [];

  constructor({
    name,
    env,
    subject,
    subjects,
    filter,
    options,
  }: StreamOptions) {
    super();
    this.env = env;
    // create a jetstream client so we can publish to the stream
    this.js = jetstream(env.nc);
    this.name = name;
    this.options = options;
    if (
      subject == null &&
      filter != null &&
      !filter.includes("*") &&
      !filter.includes(">")
    ) {
      subject = filter;
    }
    this.subject = subject;
    this.subjects = typeof subjects == "string" ? [subjects] : subjects;
    if (this.subjects.length == 0) {
      throw Error("subjects must be at least one string");
    }
    this.filter = filter;
  }

  init = reuseInFlight(async () => {
    if (this.stream != null) {
      return;
    }
    const jsm = await jetstreamManager(this.env.nc);
    const options = {
      subjects: this.subjects,
      compression: "s2",
      // our streams are relatively small so a longer duplicate window than 2 minutes seems ok.
      duplicate_window: nanos(1000 * 60 * 15),
      ...this.options,
    };
    try {
      this.stream = await jsm.streams.add({
        name: this.name,
        ...options,
      });
    } catch (err) {
      // probably already exists, so try to modify to have the requested properties.
      this.stream = await jsm.streams.update(this.name, options);
    }
    this.startFetch();
  });

  publish = async (event: any, subject?: string, options?) => {
    return await this.js.publish(
      subject ?? this.subject,
      this.env.jc.encode(event),
      options,
    );
  };

  private getConsumer = async ({ startSeq }: { startSeq?: number } = {}) => {
    const js = jetstream(this.env.nc);
    const jsm = await jetstreamManager(this.env.nc);
    // making an ephemeral consumer, which is automatically destroyed by NATS
    // after inactive_threshold.   At that point we MUST reset state.
    const options = {
      filter_subject: this.filter,
      inactive_threshold: nanos(EPHEMERAL_CONSUMER_THRESH),
    };
    let startOptions;
    if (startSeq != null) {
      startOptions = {
        deliver_policy: "by_start_sequence",
        opt_start_seq: startSeq,
      };
    } else {
      startOptions = {};
    }
    const { name } = await jsm.consumers.add(this.name, {
      ...options,
      ...startOptions,
    });
    return await js.consumers.get(this.name, name);
  };

  private startFetch = async (options?) => {
    const consumer = await this.getConsumer(options);
    // This goes in two stages:
    // STAGE 1: Get what is in the stream now.
    // First we get info so we know how many messages
    // are already in the stream:
    const info = await consumer.info();
    const fetch = await consumer.fetch();
    this.watch = fetch;
    let i = 0;
    // grab the messages.  This should be very efficient since it
    // internally grabs them in batches.
    for await (const mesg of fetch) {
      this.handle(mesg, true);
      i += 1;
      if (i >= info.num_pending) {
        break;
      }
    }
    if (this.stream == null) {
      // closed *during* initial load
      return;
    }

    this.monitorConsumer(consumer);

    // STAGE 2: Watch for new events.  It's the same consumer though,
    // so we are **guaranteed** not to miss anything.
    this.emit("connected");
    const consume = await consumer.consume();
    this.watch = consume;
    for await (const mesg of consume) {
      this.handle(mesg, false);
    }
  };

  private monitorConsumer = async (consumer) => {
    while (this.stream != null) {
      try {
        await consumer.info();
      } catch (err) {
        // console.log(`monitorConsumer -- got err ${err}`);
        if (
          err.name == "ConsumerNotFoundError" ||
          err.code == 10014 ||
          err.message == "consumer not found"
        ) {
          // if it is a consumer not found error, we make a new consumer,
          // starting AFTER the last event we retrieved
          this.watch.stop(); // stop current watch
          // make new one:
          const startSeq = this.raw[this.raw.length - 1]?.seq + 1;
          this.startFetch({ startSeq });
          return; // because startFetch creates a new consumer monitor loop
        }
      }
    }
    await delay(CONSUMER_MONITOR_INTERVAL);
  };

  private handle = (raw, noEmit = false) => {
    let event;
    try {
      event = this.env.jc.decode(raw.data);
    } catch {
      event = raw.data;
    }
    this.events.push(event);
    this.raw.push(raw);
    if (!noEmit) {
      this.emit("change", event, raw);
    }
  };

  close = () => {
    if (this.watch == null) {
      return;
    }
    this.watch.stop();
    delete this.watch;
    delete this.stream;
    this.emit("closed");
    this.removeAllListeners();
  };
}

// One stream for each account and one for each project.
// Use the filters to restrict, e.g., to events about a particular file.

export interface UserStreamOptions {
  env: NatsEnv;
  name: string;
  account_id?: string;
  project_id?: string;
}

const streamCache: { [key: string]: Stream } = {};
export const stream = reuseInFlight(
  async ({ env, account_id, project_id, name }: UserStreamOptions) => {
    const jsname = jsName({ account_id, project_id });
    const subjects = streamSubject({ account_id, project_id });
    const filter = subjects.replace(">", name);
    const key = JSON.stringify([name, jsname]);
    if (streamCache[key] == null) {
      const stream = new Stream({
        name: jsname,
        subjects,
        subject: filter,
        filter,
        env,
      });
      await stream.init();
      streamCache[key] = stream;
      stream.on("closed", () => {
        delete streamCache[key];
      });
    }
    return streamCache[key];
  },
  {
    createKey: (args) =>
      JSON.stringify([args[0].account_id, args[0].project_id, args[0].name]),
  },
);
