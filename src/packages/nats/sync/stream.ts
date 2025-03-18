/*
Consistent Centralized Event Stream = ordered list of messages

DEVELOPMENT:

# note the package directory!!
~/cocalc/src/packages/backend n
Welcome to Node.js v18.17.1.
Type ".help" for more information.
> s = await require("@cocalc/backend/nats/sync").stream({name:'test'})


> env = await require("@cocalc/backend/nats/env").getEnv(); a = require("@cocalc/nats/sync/stream"); s = new a.Stream({name:'test',env,subjects:'foo',filter:'foo'}); await s.init();


With browser client using a project:

# in browser
> s = await cc.client.nats_client.stream({project_id:cc.current().project_id,name:'foo'})

# in node:
> env = await require("@cocalc/backend/nats/env").getEnv(); a = require("@cocalc/nats/sync/stream"); s = await a.stream({project_id:cc.current().project_id,name:'foo', env})


# Involving limits:

> env = await require("@cocalc/backend/nats/env").getEnv(); a = require("@cocalc/nats/sync/stream"); s = await a.stream({project_id:cc.current().project_id,name:'foo', env, limits:{max_msgs:5,max_age:1000000*1000*15,max_bytes:10000,max_msg_size:1000}})
> s.getAll()

In browser:
> s = await cc.client.nats_client.stream({project_id:cc.current().project_id, name:'foo',limits:{max_msgs:5,max_age:1000000*1000*15,max_bytes:10000,max_msg_size:1000}})

TODO:
  - maybe the limits and other config should be stored in a KV store so
    they are sync'd between clients automatically.  That's what NATS surely
    does internally.


*/

import { EventEmitter } from "events";
import { type NatsEnv } from "@cocalc/nats/types";
import {
  jetstreamManager,
  jetstream,
  type JetStreamPublishOptions,
} from "@nats-io/jetstream";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { jsName, streamSubject } from "@cocalc/nats/names";
import { nanos, type Nanos, millis, getMaxPayload } from "@cocalc/nats/util";
import { delay } from "awaiting";
import { throttle } from "lodash";
import { isNumericString } from "@cocalc/util/misc";
import { map as awaitMap } from "awaiting";
import { sha1 } from "@cocalc/util/misc";
import refCache from "@cocalc/util/refcache";
import { type JsMsg } from "@nats-io/jetstream";
import { getEnv } from "@cocalc/nats/client";
import type { JSONValue } from "@cocalc/util/types";
import { headers as createHeaders } from "@nats-io/nats-core";
import { CHUNKS_HEADER } from "./general-kv";

class PublishRejectError extends Error {
  code: string;
  mesg: any;
  subject?: string;
}

const MAX_PARALLEL = 50;

// confirm that ephemeral consumer still exists every 15 seconds:
// In case of a long disconnect from the network, this is what
// ensures we successfully get properly updated.
const CONSUMER_MONITOR_INTERVAL = 15 * 1000;

// Have server keep ephemeral consumers alive for 5 minutes.  This
// means even if we drop from the internet for up to an hour, the server
// doesn't forget about our consumer.  But even if we are forgotten,
// the CONSUMER_MONITOR_INTERVAL ensures the event stream correctly works!
const EPHEMERAL_CONSUMER_THRESH = 5 * 60 * 1000;

// We re-implement exactly the same stream-wide limits that NATS has,
// but instead, these are for the stream **with the given filter**.
// Limits are enforced by all clients *client side* within a few seconds of any
// client making changes.
// For API consistency, max_age is is in nano-seconds.  Also, obviously
// the true limit is the minimum of the full NATS stream limits and
// these limits.
const ENFORCE_LIMITS_THROTTLE_MS = 3000;
export interface FilteredStreamLimitOptions {
  // How many messages may be in a Stream, oldest messages will be removed
  // if the Stream exceeds this size. -1 for unlimited.
  max_msgs: number;
  // Maximum age of any message in the stream matching the filter,
  // expressed in nanoseconds. 0 for unlimited.
  // Use 'import {nanos} from "@cocalc/nats/util"' then "nanos(milliseconds)"
  // to give input in milliseconds.
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
  // what it's called by us
  name: string;
  // actually name of the jetstream in NATS
  jsname: string;
  // subject = default subject used for publishing; defaults to filter if filter doesn't have any wildcard
  subjects: string | string[];
  subject?: string;
  filter?: string;
  env?: NatsEnv;
  natsStreamOptions?;
  limits?: Partial<FilteredStreamLimitOptions>;
  // only load historic messages starting at the given seq number.
  start_seq?: number;
  desc?: JSONValue;
}

export class Stream<T = any> extends EventEmitter {
  public readonly name: string;
  public readonly jsname: string;
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

  // don't do "this.raw=" or "this.messages=" anywhere in this class!!!
  public readonly raw: JsMsg[][] = [];
  public readonly messages: T[] = [];

  constructor({
    name,
    jsname,
    env,
    subject,
    subjects,
    filter,
    natsStreamOptions,
    limits,
    start_seq,
  }: StreamOptions) {
    super();
    if (env == null) {
      throw Error("bug: env must be specified");
    }
    this.env = env;
    // create a jetstream client so we can publish to the stream
    this.js = jetstream(env.nc);
    this.name = name;
    this.jsname = jsname;
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
    return new Proxy(this, {
      get(target, prop) {
        return typeof prop == "string" && isNumericString(prop)
          ? target.get(parseInt(prop))
          : target[String(prop)];
      },
    });
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
        name: this.jsname,
        ...options,
      });
    } catch (err) {
      // probably already exists, so try to modify to have the requested properties.
      this.stream = await this.jsm.streams.update(this.jsname, options);
    }
    const consumer = await this.fetchInitialData();
    if (this.stream == null) {
      // closed *during* initial load
      return;
    }
    this.env.nc.on?.("reconnect", this.restartConsumer);
    this.watchForNewData(consumer);
  });

  get = (n?): T | T[] => {
    if (this.js == null) {
      throw Error("closed");
    }
    if (n == null) {
      return this.getAll();
    } else {
      return this.messages[n];
    }
  };

  getAll = (): T[] => {
    if (this.js == null) {
      throw Error("closed");
    }
    return [...this.messages];
  };

  headers = (n: number): { [key: string]: string } | undefined => {
    if (this.raw[n] == null) {
      return;
    }
    const x: { [key: string]: string } = {};
    let hasHeaders = false;
    for (const raw of this.raw[n]) {
      const { headers } = raw;
      if (headers == null) {
        continue;
      }
      for (const [key, value] of headers) {
        x[key] = value[0];
        hasHeaders = true;
      }
    }
    return hasHeaders ? x : undefined;
  };

  // get server assigned global sequence number of n-th message in stream
  seq = (n: number): number | undefined => {
    return last(this.raw[n])?.seq;
  };

  // get server assigned time of n-th message in stream
  time = (n: number): Date | undefined => {
    const r = last(this.raw[n]);
    if (r == null) {
      return;
    }
    return new Date(millis(r?.info.timestampNanos));
  };

  get length(): number {
    return this.messages.length;
  }

  push = async (...args: T[]) => {
    await awaitMap(args, MAX_PARALLEL, this.publish);
  };

  publish = async (
    mesg: T,
    options?: Partial<
      JetStreamPublishOptions & { headers: { [key: string]: string } }
    >,
  ) => {
    if (this.js == null) {
      throw Error("closed");
    }
    const data = this.env.jc.encode(mesg);
    if (
      this.limits.max_msg_size > -1 &&
      data.length > this.limits.max_msg_size
    ) {
      const err = new PublishRejectError(
        `message size (=${data.length}) exceeds max_msg_size=${this.limits.max_msg_size} bytes`,
      );
      err.code = "REJECT";
      err.mesg = mesg;
      err.subject = this.subject;
      throw err;
    }
    this.enforceLimits();
    let resp;
    const chunks: Buffer[] = [];
    const headers: ReturnType<typeof createHeaders>[] = [];
    // we subtract off from max_payload to leave space for headers (technically, 10 is enough)
    const maxMessageSize = getMaxPayload(this.env.nc) - 1000;
    //const maxMessageSize = 20; // DEV ONLY!!!

    if (data.length > maxMessageSize) {
      // we chunk the message into blocks of size maxMessageSize,
      // to fit NATS message size limits.  We include a header
      // so we can re-assemble the chunks later.
      let data0 = data;
      while (data0.length > 0) {
        chunks.push(data0.slice(0, maxMessageSize));
        data0 = data0.slice(maxMessageSize);
      }
      const last = chunks.length;
      for (let i = 1; i <= last; i++) {
        const h = createHeaders();
        if (i == 1 && options?.headers != null) {
          // also include custom user headers
          for (const k in options.headers) {
            h.append(k, options.headers[k]);
          }
        }
        h.append(CHUNKS_HEADER, `${i}/${last}`);
        headers.push(h);
      }
    } else {
      // trivial chunk and no header needed.
      chunks.push(data);
      if (options?.headers != null) {
        const h = createHeaders();
        for (const k in options.headers) {
          h.append(k, options.headers[k]);
        }
        headers.push(h);
      }
    }

    for (let i = 0; i < chunks.length; i++) {
      try {
        resp = await this.js.publish(this.subject, chunks[i], {
          ...options,
          // if options contains a msgID, we must make it different for each chunk;
          // otherwise, all but the first chunk is discarded!
          ...(options?.msgID == null
            ? undefined
            : { msgID: `${options.msgID}-${i}` }),
          headers: headers[i],
        });
      } catch (err) {
        if (err.code == "MAX_PAYLOAD_EXCEEDED") {
          // nats rejects due to payload size
          const err2 = new PublishRejectError(`${err}`);
          err2.code = "REJECT";
          err2.mesg = mesg;
          err2.subject = this.subject;
          throw err2;
        } else {
          throw err;
        }
      }
    }
    this.enforceLimits();
    return resp;
  };

  private getConsumer = async ({ start_seq }: { start_seq?: number } = {}) => {
    // NOTE: do not cache or modify this in this function getConsumer,
    // since it is also called by load and when reconnecting.
    const js = jetstream(this.env.nc);
    const jsm = await jetstreamManager(this.env.nc);
    // making an ephemeral consumer, which is automatically destroyed by NATS
    // after inactive_threshold.   At that point we MUST reset state.
    const options = {
      filter_subject: this.filter,
      inactive_threshold: nanos(EPHEMERAL_CONSUMER_THRESH),
    };
    let startOptions;
    if (start_seq == null && this.start_seq != null) {
      start_seq = this.start_seq;
    }
    if (start_seq != null) {
      startOptions = {
        deliver_policy: "by_start_sequence",
        opt_start_seq: start_seq,
      };
    } else {
      startOptions = {};
    }
    const { name } = await jsm.consumers.add(this.jsname, {
      ...options,
      ...startOptions,
    });
    return await js.consumers.get(this.jsname, name);
  };

  private fetchInitialData = async (options?) => {
    const consumer = await this.getConsumer(options);
    // grab the messages.  This should be very efficient since it
    // internally grabs them in batches.
    // This code seems exactly necessary and efficient, and most
    // other things I tried ended too soon or hung. See also
    // comment in getAllFromKv about permissions.
    // const start = Date.now();
    // let count = 0;
    //try {
    while (true) {
      const info = await consumer.info();
      if (info.num_pending == 0) {
        return consumer;
      }
      const fetch = await consumer.fetch({ max_messages: 1000 });
      this.watch = fetch;
      let chunks: JsMsg[] = [];
      for await (const mesg of fetch) {
        let isChunked = false;
        // chunked?
        if (mesg.headers != null) {
          for (const [key, value] of mesg.headers) {
            if (key == CHUNKS_HEADER) {
              isChunked = true;
              const v = value[0].split("/");
              if (v[0] == "1") {
                // first chunk
                chunks = [mesg];
              } else {
                chunks.push(mesg);
              }
              if (v[0] == v[1]) {
                // have all the chunks
                this.handle(chunks, true);
                this.enforceLimits();
              }
            }
          }
        }
        if (!isChunked) {
          // not chunked
          this.handle([mesg], true);
          this.enforceLimits();
        } // count += 1;
        const pending = mesg.info.pending;
        if (pending <= 0) {
          return consumer;
        }
      }
    }
    //     } finally {
    //       console.log("fetchInitialData", { count, time: Date.now() - start });
    //     }
  };

  private watchForNewData = async (consumer) => {
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
    let chunks: JsMsg[] = [];
    for await (const mesg of consume) {
      let isChunked = false;
      // chunked?
      for (const [key, value] of mesg.headers ?? []) {
        if (key == CHUNKS_HEADER) {
          isChunked = true;
          const v = value[0].split("/");
          if (v[0] == "1") {
            // first chunk
            chunks = [mesg];
          } else {
            chunks.push(mesg);
          }
          if (v[0] == v[1]) {
            // have all the chunks
            this.handle(chunks, false);
            this.enforceLimits();
          }
        }
      }
      if (!isChunked) {
        // not chunked
        this.handle([mesg], false);
        this.enforceLimits();
      }
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
          // if it is a consumer not found error, we make a new consumer:
          this.restartConsumer();
          return; // because watchForNewData creates a new consumer monitor loop
        }
      }
      await delay(CONSUMER_MONITOR_INTERVAL);
    }
  };

  private restartConsumer = async () => {
    // make a new consumer, starting AFTER the last event we retrieved
    this.watch?.stop(); // stop current watch (if any)
    // make new one:
    const start_seq = last(this.raw[this.raw.length - 1])?.seq + 1;
    const consumer = await this.fetchInitialData({ start_seq });
    if (this.stream == null) {
      // closed
      return;
    }
    this.watchForNewData(consumer);
  };

  private decode = (raw: JsMsg[]) => {
    if (raw.length == 0) {
      throw Error("must be at least one chunk");
    }
    const data =
      raw.length == 1
        ? raw[0].data
        : // @ts-ignore -- for nextjs prod
          Buffer.concat(raw.map((mesg) => mesg.data));

    try {
      return this.env.jc.decode(data);
    } catch (_err) {
      // console.log("WARNING: issue decoding nats stream data", { data, _err });
      // better than crashing:
      return data;
    }
  };

  private handle = (raw: JsMsg[], noEmit: boolean) => {
    const mesg = this.decode(raw);
    this.messages.push(mesg);
    this.raw.push(raw);
    if (!noEmit) {
      this.emit("change", mesg, raw);
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
    this.env.nc.removeListener?.("reconnect", this.restartConsumer);
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
      await this.jsm.streams.purge(this.jsname, {
        filter: this.filter,
      });
    } else {
      const { seq } = last(this.raw[index + 1]);
      await this.jsm.streams.purge(this.jsname, {
        filter: this.filter,
        seq,
      });
    }
    this.messages.splice(0, index + 1);
    this.raw.splice(0, index + 1);
  };

  stats = (): { count: number; bytes: number } | undefined => {
    if (this.raw == null) {
      return;
    }
    let count = 0;
    let bytes = 0;
    for (const raw of this.raw) {
      count += 1;
      for (const r of raw) {
        bytes += r.data.length;
      }
    }
    return { count, bytes };
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
          const now = last(recent).info.timestampNanos;
          const cutoff = now - max_age;
          for (let i = this.raw.length - 1; i >= 0; i--) {
            if (last(this.raw[i]).info.timestampNanos < cutoff) {
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
          for (const r of this.raw[i]) {
            t += r.data.length;
          }
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

  // load older messages starting at start_seq
  load = async ({ start_seq }: { start_seq: number }) => {
    if (this.start_seq == null) {
      // we already loaded everything on initialization; there can't be anything older.
      return;
    }
    const consumer = await this.getConsumer({ start_seq });
    const info = await consumer.info();
    const fetch = await consumer.fetch();
    let i = 0;
    // grab the messages.  This should be very efficient since it
    // internally grabs them in batches.
    const raw: JsMsg[][] = [];
    const messages: T[] = [];
    const cur = last(this.raw[0])?.seq;
    let chunks: JsMsg[] = [];
    for await (const mesg of fetch) {
      if (cur != null && mesg.seq >= cur) {
        break;
      }

      let isChunked = false;
      // chunked?
      for (const [key, value] of mesg.headers ?? []) {
        if (key == CHUNKS_HEADER) {
          isChunked = true;
          const v = value[0].split("/");
          if (v[0] == "0") {
            // first chunk
            chunks = [mesg];
          } else {
            chunks.push(mesg);
          }
          if (v[0] == v[1]) {
            // have all the chunks
            raw.push(chunks);
            messages.push(this.decode(chunks));
          }
        }
      }
      if (!isChunked) {
        // not chunked
        raw.push([mesg]);
        messages.push(this.decode([mesg]));
      }
      i += 1;
      if (i >= info.num_pending) {
        break;
      }
    }
    // mutate the array this.raw and this.messages by splicing in
    // raw and messages at the beginning:
    this.raw.unshift(...raw);
    this.messages.unshift(...messages);
  };
}

// One stream for each account and one for each project.
// Use the filters to restrict, e.g., to message about a particular file.

export interface UserStreamOptions {
  name: string;
  env?: NatsEnv;
  account_id?: string;
  project_id?: string;
  limits?: Partial<FilteredStreamLimitOptions>;
  start_seq?: number;
  noCache?: boolean;
  desc?: JSONValue;
}

export function userStreamOptionsKey(options: UserStreamOptions) {
  if (!options.name) {
    throw Error("name must be specified");
  }
  const { env, ...x } = options;
  return JSON.stringify(x);
}

export const cache = refCache<UserStreamOptions, Stream>({
  createKey: userStreamOptionsKey,
  createObject: async (options) => {
    if (options.env == null) {
      options.env = await getEnv();
    }
    const { account_id, project_id, name } = options;
    const jsname = jsName({ account_id, project_id });
    const subjects = streamSubject({ account_id, project_id });
    const filter = subjects.replace(">", (options.env.sha1 ?? sha1)(name));
    const stream = new Stream({
      ...options,
      name,
      jsname,
      subjects,
      subject: filter,
      filter,
    });
    await stream.init();
    return stream;
  },
});

export async function stream<T>(
  options: UserStreamOptions,
): Promise<Stream<T>> {
  return await cache(options);
}

export function last(v: any[] | undefined) {
  if (v === undefined) {
    return v;
  }
  return v[v.length - 1];
}
