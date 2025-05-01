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

> env = await require("@cocalc/backend/nats/env").getEnv(); a = require("@cocalc/nats/sync/stream"); s = await a.stream({project_id:cc.current().project_id,name:'foo', env, limits:{max_msgs:5,max_age:1000*15,max_bytes:10000,max_msg_size:1000}})
> s.getAll()

In browser:
> s = await cc.client.nats_client.stream({project_id:cc.current().project_id, name:'foo',limits:{max_msgs:5,max_age:1000*15,max_bytes:10000,max_msg_size:1000}})

TODO:
  - maybe the limits and other config should be stored in a KV store so
    they are sync'd between clients automatically.  That's what NATS surely
    does internally.


*/

import { EventEmitter } from "events";
import { type NatsEnv, type ValueType } from "@cocalc/nats/types";
import {
  jetstreamManager,
  jetstream,
  type JetStreamPublishOptions,
  AckPolicy,
} from "@nats-io/jetstream";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { jsName, streamSubject } from "@cocalc/nats/names";
import {
  getMaxPayload,
  waitUntilConnected,
  isConnected,
  millis,
  encodeBase64,
  nanos,
} from "@cocalc/nats/util";
import { delay } from "awaiting";
import { throttle } from "lodash";
import { isNumericString } from "@cocalc/util/misc";
import { map as awaitMap } from "awaiting";
import refCache from "@cocalc/util/refcache";
import { type JsMsg } from "@nats-io/jetstream";
import { getEnv } from "@cocalc/nats/client";
import type { JSONValue } from "@cocalc/util/types";
import { headers as createHeaders } from "@nats-io/nats-core";
import { CHUNKS_HEADER } from "./general-kv";
import jsonStableStringify from "json-stable-stringify";
import { asyncDebounce } from "@cocalc/util/async-utils";
import { waitUntilReady } from "@cocalc/nats/tiered-storage/client";
import { COCALC_MESSAGE_ID_HEADER, type RawMsg } from "./ephemeral-stream";

const PUBLISH_TIMEOUT = 15000;

class PublishRejectError extends Error {
  code: string;
  mesg: any;
  subject?: string;
  limit?: string;
}

const MAX_PARALLEL = 50;

const CONNECTION_CHECK_INTERVAL = 5000;

// Making this too LONG is very dangerous since it increases load on the server.
// Making it too short means it has to get recreated whenever the network connection drops.
const EPHEMERAL_CONSUMER_THRESH = 45 * 1000;

//console.log("!!! ALERT: USING VERY SHORT CONSUMERS FOR TESTING!");
//const EPHEMERAL_CONSUMER_THRESH = 3 * 1000;

// We re-implement exactly the same stream-wide limits that NATS has,
// but instead, these are for the stream **with the given filter**.
// Limits are enforced by all clients *client side* within ENFORCE_LIMITS_THROTTLE_MS
// of any client making changes.  It is important to significantly throttle
// this, as it can be expensive to the server.
// Also, obviously the true limit is the minimum of the full NATS stream limits and
// these limits.

// Significant throttling is VERY, VERY important, since purging old messages frequently
// seems to put a very significant load on NATS!
export const ENFORCE_LIMITS_THROTTLE_MS = process.env.COCALC_TEST_MODE
  ? 100
  : 45000;

export interface FilteredStreamLimitOptions {
  // How many messages may be in a Stream, oldest messages will be removed
  // if the Stream exceeds this size. -1 for unlimited.
  max_msgs: number;
  // Maximum age of any message in the stream matching the filter,
  // expressed in milliseconds. 0 for unlimited.
  // **Note that max_age is in milliseoncds, NOT nanoseconds like in Nats!!!**
  max_age: number;
  // How big the Stream may be, when the combined stream size matching the filter
  // exceeds this old messages are removed. -1 for unlimited.
  // This is enforced only on write, so if you change it, it only applies
  // to future messages.
  max_bytes: number;
  // The largest message that will be accepted by the Stream. -1 for unlimited.
  max_msg_size: number;

  // Attempting to publish a message that causes this to be exceeded
  // throws an exception instead.  -1 (or 0) for unlimited
  // For dstream, the messages are explicitly rejected and the client
  // gets a "reject" event emitted.  E.g., the terminal running in the project
  // writes [...] when it gets these rejects, indicating that data was
  // dropped.
  max_bytes_per_second: number;
  max_msgs_per_second: number;
}

export interface StreamOptions {
  // what it's called by us
  name: string;
  // actually name of the jetstream in NATS
  jsname: string;
  // subject = default subject used for publishing; defaults to filter if filter doesn't have any wildcard
  subject?: string;
  subjects: string | string[];
  filter?: string;
  env?: NatsEnv;
  natsStreamOptions?;
  limits?: Partial<FilteredStreamLimitOptions>;
  // only load historic messages starting at the given seq number.
  start_seq?: number;
  desc?: JSONValue;
  valueType?: ValueType;
}

export class Stream<T = any> extends EventEmitter {
  public readonly name: string;
  public readonly jsname: string;
  private natsStreamOptions?;
  private limits: FilteredStreamLimitOptions;
  private bytesSent: { [time: number]: number } = {};
  private subjects: string | string[];
  private filter?: string;
  private subject?: string;
  private env: NatsEnv;
  private _start_seq?: number;
  private js;
  private jsm;
  private stream?;
  private watch?;
  public readonly valueType: ValueType;
  // seq = the last sequence number of a message on this stream that we received
  // from NATS. This is used only for resuming without missing anything.
  private last_seq: number = 1;

  // don't do "this.raw=" or "this.messages=" anywhere in this class!!!
  public readonly raw: JsMsg[][] = [];
  public readonly messages: T[] = [];
  private consumer?;

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
    valueType = "json",
  }: StreamOptions) {
    super();

    this.valueType = valueType;
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
    this._start_seq = start_seq;
    this.limits = {
      max_msgs: -1,
      max_age: 0,
      max_bytes: -1,
      max_msg_size: -1,
      max_bytes_per_second: -1,
      max_msgs_per_second: -1,
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
      duplicate_window: nanos(1000 * 60 * 5),
      ...this.natsStreamOptions,
    };
    await waitUntilReady(this.jsname);
    try {
      this.stream = await this.jsm.streams.add({
        name: this.jsname,
        ...options,
      });
    } catch (err) {
      // probably already exists, so try to modify to have the requested properties.
      this.stream = await this.jsm.streams.update(this.jsname, options);
    }
    await this.fetchInitialData({
      // do not broadcast initial load
      noEmit: true,
    });
    if (this.stream == null) {
      // closed *during* initial load
      return;
    }
    this.ensureConnected();
    this.watchForNewData();
  });

  private ensureConnected = async () => {
    if (this.env.nc.on != null) {
      this.env.nc.on("reconnect", this.restartConsumer);
      this.env.nc.on("status", ({ type }) => {
        if (type == "reconnect") {
          this.ensureConsumerIsValid();
        }
      });
    } else {
      this.checkConsumerOnReconnect();
    }
    while (this.stream != null) {
      if (!(await isConnected())) {
        await this.restartConsumer();
      }
      await delay(CONNECTION_CHECK_INTERVAL);
    }
  };

  // We can't do this all the time due to efficiency
  // (see https://www.synadia.com/blog/jetstream-design-patterns-for-scale)
  // but we **MUST do it around connection events**
  // no matter what the docs say or otherwise!!!!
  // At least with the current nats.js drivers.
  // Often nats does recreate the consumer, but sometimes it doesn't.
  // I can't nail down which is which.
  private ensureConsumerIsValid = asyncDebounce(
    async () => {
      await waitUntilConnected();
      await delay(2000);
      const isValid = await this.isConsumerStillValid();
      if (!isValid) {
        if (this.stream == null) {
          return;
        }
        console.log(
          `nats stream: ${this.name} -- consumer not valid, so recreating`,
        );
        await this.restartConsumer();
      }
    },
    3000,
    { leading: false, trailing: true },
  );

  private checkConsumerOnReconnect = async () => {
    while (this.stream != null) {
      try {
        for await (const { type } of await this.env.nc.status()) {
          if (type == "reconnect") {
            await this.ensureConsumerIsValid();
          }
        }
      } catch {
        await delay(15000);
        await this.ensureConsumerIsValid();
      }
    }
  };

  private isConsumerStillValid = async () => {
    await waitUntilConnected();
    if (this.consumer == null || this.stream == null) {
      return false;
    }
    try {
      await this.consumer.info();
      return true;
    } catch (err) {
      console.log(`nats: consumer.info error -- ${err}`);
      return false;
    }
  };

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
    return headersFromRawMessages(this.raw[n]);
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

  times = (): (Date | undefined)[] => {
    const v: (Date | undefined)[] = [];
    for (let i = 0; i < this.length; i++) {
      v.push(this.time(i));
    }
    return v;
  };

  get length(): number {
    return this.messages.length;
  }

  get start_seq(): number | undefined {
    return this._start_seq;
  }

  // WARNING: if you push multiple values at once here, then the order is NOT guaranteed
  push = async (...args: T[]) => {
    await awaitMap(args, MAX_PARALLEL, this.publish);
  };

  private encodeValue = (value) => {
    return this.valueType == "json" ? this.env.jc.encode(value) : value;
  };

  private decodeValue = (value) => {
    return this.valueType == "json" ? this.env.jc.decode(value) : value;
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
    const data = this.encodeValue(mesg);
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
      err.limit = "max_msg_size";
      throw err;
    }
    this.enforceLimits();
    if (options?.msgID) {
      if (options.headers) {
        // also put it here so can be used to clear this.local by dstream:
        options.headers[COCALC_MESSAGE_ID_HEADER] = options.msgID;
      } else {
        options.headers = { [COCALC_MESSAGE_ID_HEADER]: options.msgID };
      }
    }
    let resp;
    const chunks: Buffer[] = [];
    const headers: ReturnType<typeof createHeaders>[] = [];
    // we subtract off from max_payload to leave space for headers (technically, 10 is enough)
    await waitUntilConnected();
    const maxMessageSize = (await getMaxPayload()) - 1000;
    //const maxMessageSize = 20; // DEV ONLY!!!

    // this may throw an exception:
    enforceRateLimits({
      limits: this.limits,
      bytesSent: this.bytesSent,
      subject: this.subject,
      data,
      mesg,
    });

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
            h.append(k, `${options.headers[k]}`);
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
          h.append(k, `${options.headers[k]}`);
        }
        headers.push(h);
      }
    }

    for (let i = 0; i < chunks.length; i++) {
      try {
        await waitUntilConnected();
        resp = await this.js.publish(this.subject, chunks[i], {
          timeout: PUBLISH_TIMEOUT,
          ...options,
          // if options contains a msgID, we must make it different for each chunk;
          // otherwise, all but the first chunk is discarded!
          ...(options?.msgID == null
            ? undefined
            : { msgID: `${options.msgID}-${i}` }),
          headers: headers[i],
        });
        // NOTE: the resp we get back contains a sequence number and GUARANTEES that the
        // data has been written to disk by the nats server.
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
      ack_policy: AckPolicy.Explicit,
      inactive_threshold: nanos(EPHEMERAL_CONSUMER_THRESH),
    };
    let startOptions;
    if (start_seq == null && this._start_seq != null) {
      start_seq = this._start_seq;
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
    if (this.consumer != null) {
      try {
        await this.consumer.delete();
      } catch {
        // this absolutely *can* throw an error if the consumer was already deleted
        // automatically on the server for some reason!
      }
      delete this.consumer;
    }
    this.consumer = await js.consumers.get(this.jsname, name);
    return this.consumer;
  };

  private fetchInitialData = async ({
    options,
    noEmit,
  }: {
    options?;
    noEmit: boolean;
  }) => {
    const consumer = await this.getConsumer(options);
    // grab the messages.  This should be very efficient since it
    // internally grabs them in batches.
    // This code seems exactly necessary and efficient, and most
    // other things I tried ended too soon or hung. See also
    // comment in getAllFromKv about permissions.
    while (true) {
      // https://www.synadia.com/blog/jetstream-design-patterns-for-scale says
      // "Consumer info is also frequently misused as a method for clients to check
      // for pending messages. Instead, get this metadata from the last message
      // fetched to avoid the unnecessary overhead of consumer info."
      const info = await consumer.info();
      if (info.num_pending == 0) {
        return consumer;
      }
      const fetch = await consumer.fetch({ max_messages: 1000 });
      this.watch = fetch;
      let chunks: JsMsg[] = [];
      for await (const mesg of fetch) {
        mesg.ack();
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
                this.handle(chunks, noEmit);
                this.enforceLimits();
              }
            }
          }
        }
        if (!isChunked) {
          // not chunked
          this.handle([mesg], noEmit);
          this.enforceLimits();
        }
        const pending = mesg.info.pending;
        if (pending <= 0) {
          return consumer;
        }
      }
    }
  };

  private watchForNewData = async () => {
    if (this.stream == null) {
      // closed *during* initial load
      return;
    }
    // STAGE 2: Watch for new mesg.  It's the same consumer though,
    // so we are **guaranteed** not to miss anything.
    this.enforceLimits();
    this.emit("connected");
    const consume = await this.consumer.consume();
    this.watch = consume;
    let chunks: JsMsg[] = [];
    for await (const mesg of consume) {
      mesg.ack();
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

  // this does not throw an exception -- it keeps trying until success.
  private restartConsumer = reuseInFlight(async (): Promise<void> => {
    await waitUntilConnected();
    if (this.stream == null) {
      return;
    }
    // make a new consumer, starting AFTER the last event we retrieved
    let d = 250;
    while (true) {
      this.watch?.stop(); // stop current watch (if any)
      // make new one:
      const start_seq = this.last_seq + 1;
      try {
        // noEmit = false since we DO want to emit an event for any changes at this point!!
        this.consumer = await this.fetchInitialData({
          options: { start_seq },
          noEmit: false,
        });
        if (this.stream == null) {
          // closed
          return;
        }
        this.watchForNewData();
        return;
      } catch (err) {
        d = Math.min(30000, d * 1.3) + Math.random();
        await delay(d);
      }
    }
  });

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
      return this.decodeValue(data);
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
    for (const { seq } of raw) {
      this.last_seq = Math.max(this.last_seq, seq);
    }
    if (!noEmit) {
      this.emit("change", mesg, raw);
    }
  };

  close = () => {
    if (this.watch == null) {
      return;
    }
    (async () => {
      try {
        await this.consumer?.delete();
        delete this.consumer;
      } catch {
        // this absolutely *can* throw an error if the consumer was already deleted
        // automatically on the server for some reason!
      }
    })();
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

  // get stats for this stream using data we have already downloaded, BUT
  // only considering messages with sequence >= start_seq.
  stats = ({
    start_seq = 1,
  }: {
    start_seq?: number;
  }): { count: number; bytes: number } | undefined => {
    if (this.raw == null) {
      return;
    }
    let count = 0;
    let bytes = 0;
    for (const raw of this.raw) {
      const seq = last(raw)?.seq;
      if (seq == null) {
        continue;
      }
      if (seq < start_seq) {
        continue;
      }
      count += 1;
      for (const r of raw) {
        bytes += r.data.length;
      }
    }
    return { count, bytes };
  };

  private enforceLimitsNow = reuseInFlight(async () => {
    if (this.jsm == null) {
      return;
    }
    const index = enforceLimits({
      messages: this.messages,
      raw: this.raw,
      limits: this.limits,
    });
    // console.log("enforceLImits", { index });
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
  });

  // ensure any limits are satisfied, i.e., delete old messages.
  private enforceLimits = throttle(
    this.enforceLimitsNow,
    ENFORCE_LIMITS_THROTTLE_MS,
    { leading: false, trailing: true },
  );

  // load older messages starting at start_seq
  load = async ({
    start_seq,
    noEmit,
  }: {
    start_seq: number;
    noEmit?: boolean;
  }) => {
    if (this._start_seq == null || this._start_seq <= 1) {
      // we already loaded everything on initialization; there can't be anything older.
      return;
    }
    const consumer = await this.getConsumer({ start_seq });
    // https://www.synadia.com/blog/jetstream-design-patterns-for-scale says
    // "Consumer info is also frequently misused as a method for clients to check
    // for pending messages. Instead, get this metadata from the last message
    // fetched to avoid the unnecessary overhead of consumer info."
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
            messages.push(this.decodeValue(chunks));
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
    if (!noEmit) {
      for (let i = 0; i < raw.length; i++) {
        this.emit("change", messages[i], raw[i]);
      }
    }
    this._start_seq = start_seq;
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
  valueType?: ValueType;
}

export function userStreamOptionsKey(options: UserStreamOptions) {
  if (!options.name) {
    throw Error("name must be specified");
  }
  const { env, ...x } = options;
  return jsonStableStringify(x);
}

export const cache = refCache<UserStreamOptions, Stream>({
  name: "stream",
  createKey: userStreamOptionsKey,
  createObject: async (options) => {
    if (options.env == null) {
      options.env = await getEnv();
    }
    const { account_id, project_id, name } = options;
    const jsname = jsName({ account_id, project_id });
    const subjects = streamSubject({ account_id, project_id });
    const filter = subjects.replace(">", encodeBase64(name));
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

export function enforceLimits({
  messages,
  raw,
  limits,
}: {
  messages: any[];
  raw: (JsMsg | RawMsg)[][];
  limits: FilteredStreamLimitOptions;
}) {
  const { max_msgs, max_age, max_bytes } = limits;
  // we check with each defined limit if some old messages
  // should be dropped, and if so move limit forward.  If
  // it is above -1 at the end, we do the drop.
  let index = -1;
  const setIndex = (i, _limit) => {
    // console.log("setIndex", { i, _limit });
    index = Math.max(i, index);
  };
  // max_msgs
  // console.log({ max_msgs, l: messages.length, messages });
  if (max_msgs > -1 && messages.length > max_msgs) {
    // ensure there are at most limits.max_msgs messages
    // by deleting the oldest ones up to a specified point.
    const i = messages.length - max_msgs;
    if (i > 0) {
      setIndex(i - 1, "max_msgs");
    }
  }

  // max_age
  if (max_age > 0) {
    // expire messages older than max_age nanoseconds
    const recent = raw[raw.length - 1];
    if (recent != null) {
      // to avoid potential clock skew, we define *now* as the time of the most
      // recent message.  For us, this should be fine, since we only impose limits
      // when writing new messages, and none of these limits are guaranteed.
      const nanos = last(recent).info?.timestampNanos;
      const now = nanos ? nanos / 10 ** 6 : last(recent).timestamp;
      if (now) {
        const cutoff = now - max_age;
        for (let i = raw.length - 1; i >= 0; i--) {
          const nanos = last(raw[i]).info?.timestampNanos;
          const t = nanos ? nanos / 10 ** 6 : last(raw[i]).timestamp;
          if (t < cutoff) {
            // it just went over the limit.  Everything before
            // and including the i-th message must be deleted.
            setIndex(i, "max_age");
            break;
          }
        }
      }
    }
  }

  // max_bytes
  if (max_bytes >= 0) {
    let t = 0;
    for (let i = raw.length - 1; i >= 0; i--) {
      for (const r of raw[i]) {
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

  return index;
}

export function enforceRateLimits({
  limits,
  bytesSent,
  subject,
  data,
  mesg,
}: {
  limits: { max_bytes_per_second: number; max_msgs_per_second: number };
  bytesSent: { [time: number]: number };
  subject?: string;
  data;
  mesg;
}) {
  const now = Date.now();
  if (!(limits.max_bytes_per_second > 0) && !(limits.max_msgs_per_second > 0)) {
    return;
  }

  const cutoff = now - 1000;
  let bytes = 0,
    msgs = 0;
  for (const t in bytesSent) {
    if (parseInt(t) < cutoff) {
      delete bytesSent[t];
    } else {
      bytes += bytesSent[t];
      msgs += 1;
    }
  }
  if (
    limits.max_bytes_per_second > 0 &&
    bytes + data.length > limits.max_bytes_per_second
  ) {
    const err = new PublishRejectError(
      `bytes per second limit of ${limits.max_bytes_per_second} exceeded`,
    );
    err.code = "REJECT";
    err.mesg = mesg;
    err.subject = subject;
    err.limit = "max_bytes_per_second";
    throw err;
  }
  if (limits.max_msgs_per_second > 0 && msgs > limits.max_msgs_per_second) {
    const err = new PublishRejectError(
      `messages per second limit of ${limits.max_msgs_per_second} exceeded`,
    );
    err.code = "REJECT";
    err.mesg = mesg;
    err.subject = subject;
    err.limit = "max_msgs_per_second";
    throw err;
  }
  bytesSent[now] = data.length;
}

export function headersFromRawMessages(messages?: (JsMsg | RawMsg)[]) {
  if (messages == null) {
    return undefined;
  }
  const x: { [key: string]: string } = {};
  let hasHeaders = false;
  for (const raw of messages) {
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
}
