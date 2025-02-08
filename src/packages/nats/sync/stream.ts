/*
Consistent Centralized Event Stream = ordered list of messages

TODO:
  - ability to easily initialize with only messages starting at a given seq
  - load old messages starting at a given seq.
  - maybe the limits and other config should be stored in a KV store so
    they are sync'd between clients automatically.  That's what NATS surely
    does internally.

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


# Involving limits:

> env = await require("@cocalc/backend/nats/env").getEnv(); a = require("@cocalc/nats/sync/stream"); s = await a.stream({project_id:'56eb622f-d398-489a-83ef-c09f1a1e8094',name:'foo', env, limits:{max_msgs:5,max_age:1000000*1000*15,max_bytes:10000,max_msg_size:1000}})
> s.get()

In browser:
> s = await cc.client.nats_client.stream({project_id:'56eb622f-d398-489a-83ef-c09f1a1e8094',name:'foo',limits:{max_msgs:5,max_age:1000000*1000*15,max_bytes:10000,max_msg_size:1000}})


*/

import { EventEmitter } from "events";
import { type NatsEnv } from "@cocalc/nats/types";
import { jetstreamManager, jetstream } from "@nats-io/jetstream";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { jsName, streamSubject } from "@cocalc/nats/names";
import { nanos, type Nanos } from "@cocalc/nats/util";
import { delay } from "awaiting";
import { throttle } from "lodash";

// confirm that ephemeral consumer still exists every 15 seconds:
// In case of a long disconnect from the network, this is what
// ensures we successfully get properly updated.
const CONSUMER_MONITOR_INTERVAL = 15 * 1000;

// Have server keep ephemeral consumers alive for an hour.  This
// means even if we drop from the internet for up to an hour, the server
// doesn't forget about our consumer.  But even if we are forgotten,
// the CONSUMER_MONITOR_INTERVAL ensures the event stream correctly works!
const EPHEMERAL_CONSUMER_THRESH = 60 * 60 * 1000;

// We re-implement exactly the same stream-wide limits that NATS has,
// but instead, these are for the stream **with the given filter**.
// Limits are enforced by all clients *client side* within a few seconds of any
// client making changes.
// For API consistency, max_age is is in nano-seconds.  Also, obviously
// the true limit is the minimum of the full NATS stream limits and
// these limits.
const ENFORCE_LIMITS_THROTTLE_MS = 3000;
interface FilteredStreamLimitOptions {
  // How many messages may be in a Stream, oldest messages will be removed
  // if the Stream exceeds this size. -1 for unlimited.
  max_msgs: number;
  // Maximum age of any message in the stream matching the filter,
  // expressed in nanoseconds. 0 for unlimited.
  // Use 'import {nanos} from "@cocalc/nats/util"' then "nanos(milliseconds)" to give input in ms.
  max_age: Nanos;
  // How big the Stream may be, when the combined stream size matching the filter
  // exceeds this old messages are removed. -1 for unlimited.
  // This is enforced only on write, so if you change it, it only applies
  // to future messages.
  max_bytes: number;
  // The largest message that will be accepted by the Stream. -1 for unlimited.
  max_msg_size: number;
}

export interface StreamOptions {
  name: string;
  // subject = default subject used for publishing; defaults to filter if filter doesn't have any wildcard
  subjects: string | string[];
  subject?: string;
  filter?: string;
  env: NatsEnv;
  natsStreamOptions?;
  limits?: Partial<FilteredStreamLimitOptions>;
  // only load historic messages starting at the given seq number.
  start_seq?: number;
}

export class Stream extends EventEmitter {
  public readonly name: string;
  private natsStreamOptions?;
  private limits: FilteredStreamLimitOptions;
  private subjects: string | string[];
  private filter?: string;
  private subject?: string;
  private env: NatsEnv;
  private start_seq?: number;
  private js;
  private jsm;
  private stream?;
  private watch?;
  // don't do "this.raw=" or "this.messages=" anywhere in this class!
  public readonly raw: any[] = [];
  public readonly messages: any[] = [];

  constructor({
    name,
    env,
    subject,
    subjects,
    filter,
    natsStreamOptions,
    limits,
    start_seq,
  }: StreamOptions) {
    super();
    this.env = env;
    // create a jetstream client so we can publish to the stream
    this.js = jetstream(env.nc);
    this.name = name;
    this.natsStreamOptions = natsStreamOptions;
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
    this.start_seq = start_seq;
    this.limits = {
      max_msgs: -1,
      max_age: 0,
      max_bytes: -1,
      max_msg_size: -1,
      ...limits,
    };
  }

  init = reuseInFlight(async () => {
    if (this.stream != null) {
      return;
    }
    this.jsm = await jetstreamManager(this.env.nc);
    const options = {
      subjects: this.subjects,
      compression: "s2",
      // our streams are relatively small so a longer duplicate window than 2 minutes seems ok.
      duplicate_window: nanos(1000 * 60 * 15),
      ...this.natsStreamOptions,
    };
    try {
      this.stream = await this.jsm.streams.add({
        name: this.name,
        ...options,
      });
    } catch (err) {
      // probably already exists, so try to modify to have the requested properties.
      this.stream = await this.jsm.streams.update(this.name, options);
    }
    this.startFetch();
  });

  get = () => {
    return [...this.messages];
  };

  publish = async (mesg: any, subject?: string, options?) => {
    if (this.js == null) {
      throw Error("closed");
    }
    const data = this.env.jc.encode(mesg);
    if (
      this.limits.max_msg_size > -1 &&
      data.length > this.limits.max_msg_size
    ) {
      throw Error(
        `message size exceeds max_msg_size=${this.limits.max_msg_size} bytes`,
      );
    }
    this.enforceLimits();
    const resp = await this.js.publish(subject ?? this.subject, data, options);
    this.enforceLimits();
    return resp;
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
    if (startSeq == null && this.start_seq != null) {
      startSeq = this.start_seq;
    }
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

    // STAGE 2: Watch for new mesg.  It's the same consumer though,
    // so we are **guaranteed** not to miss anything.
    this.enforceLimits();
    this.emit("connected");
    const consume = await consumer.consume();
    this.watch = consume;
    for await (const mesg of consume) {
      this.handle(mesg, false);
      this.enforceLimits();
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
    this.messages.push(event);
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
    delete this.jsm;
    delete this.js;
    this.emit("closed");
    this.removeAllListeners();
  };

  // delete all messages up to and including the
  // one at position index, i.e., this.messages[index]
  // is deleted.
  // NOTE: other clients will NOT see the result of a purge,
  // except when done implicitly via limits, since all clients
  // truncate this.raw and this.messages directly.
  purge = async ({ index = -1 }: { index?: number } = {}) => {
    // console.log("purge", { index });
    if (index >= this.raw.length - 1 || index == -1) {
      index = this.raw.length - 1;
      // everything
      // console.log("purge everything");
      await this.jsm.streams.purge(this.name, {
        filter: this.filter,
      });
    } else {
      const { seq } = this.raw[index + 1];
      await this.jsm.streams.purge(this.name, {
        filter: this.filter,
        seq,
      });
    }
    this.messages.splice(0, index + 1);
    this.raw.splice(0, index + 1);
  };

  // ensure any limits are satisfied, i.e., delete old messages.
  private enforceLimits = throttle(
    reuseInFlight(async () => {
      if (this.jsm == null) {
        return;
      }
      const { max_msgs, max_age, max_bytes } = this.limits;
      // we check with each defined limit if some old messages
      // should be dropped, and if so move limit forward.  If
      // it is above -1 at the end, we do the drop.
      let index = -1;
      const setIndex = (i, _limit) => {
        // console.log("setIndex", { i, _limit });
        index = Math.max(i, index);
      };
      //max_msgs
      if (max_msgs > -1 && this.messages.length > max_msgs) {
        // ensure there are at most this.limits.max_msgs messages
        // by deleting the oldest ones up to a specified point.
        const i = this.messages.length - max_msgs;
        if (i > 0) {
          setIndex(i - 1, "max_msgs");
        }
      }

      // max_age
      if (max_age > 0) {
        // expire messages older than max_age nanoseconds
        const recent = this.raw[this.raw.length - 1];
        if (recent != null) {
          // to avoid potential clock skew, we define *now* as the time of the most
          // recent message.  For us, this should be fine, since we only impose limits
          // when writing new messages, and none of these limits are guaranteed.
          const now = recent.info.timestampNanos;
          const cutoff = now - max_age;
          for (let i = this.raw.length - 1; i >= 0; i--) {
            if (this.raw[i].info.timestampNanos < cutoff) {
              // it just went over the limit.  Everything before
              // and including the i-th message must be deleted.
              setIndex(i, "max_age");
              break;
            }
          }
        }
      }

      // max_bytes
      if (max_bytes >= 0) {
        let t = 0;
        for (let i = this.raw.length - 1; i >= 0; i--) {
          t += this.raw[i].data.length;
          if (t > max_bytes) {
            // it just went over the limit.  Everything before
            // and including the i-th message must be deleted.
            setIndex(i, "max_bytes");
            break;
          }
        }
      }

      if (index > -1) {
        try {
          // console.log("imposing limit via purge ", { index });
          await this.purge({ index });
        } catch (err) {
          if (err.code != "TIMEOUT") {
            console.log(`WARNING: purging old messages - ${err}`);
          }
        }
      }
    }),
    ENFORCE_LIMITS_THROTTLE_MS,
    { leading: true, trailing: true },
  );
}

// One stream for each account and one for each project.
// Use the filters to restrict, e.g., to message about a particular file.

export interface UserStreamOptions {
  env: NatsEnv;
  name: string;
  account_id?: string;
  project_id?: string;
  limits?: FilteredStreamLimitOptions;
}

const streamCache: { [key: string]: Stream } = {};
export const stream = reuseInFlight(
  async ({ env, account_id, project_id, name, limits }: UserStreamOptions) => {
    const jsname = jsName({ account_id, project_id });
    const subjects = streamSubject({ account_id, project_id });
    const filter = subjects.replace(">", name);
    const key = JSON.stringify([name, jsname, limits]);
    if (streamCache[key] == null) {
      const stream = new Stream({
        name: jsname,
        subjects,
        subject: filter,
        filter,
        limits,
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
      JSON.stringify([
        args[0].account_id,
        args[0].project_id,
        args[0].name,
        args[0].limits,
      ]),
  },
);
