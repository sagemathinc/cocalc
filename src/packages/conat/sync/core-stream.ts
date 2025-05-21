/*
core-stream.ts  = the Core Stream data structure for conats.

This is the core data structure that easy-to-use ephemeral and persistent
streams and kv stores are built on.  It is NOT meant to be super easy and 
simple to use as synchronous with save in the background. Instead, operations
are async, and the API is complicated. We build dkv, dstream, etc. on
top of this with a much friendly API.


NOTE: unlike in NATS, in kv mode, the keys can be any utf-8 string.
We use the subject to track communication involving this stream, but
otherwise it has no relevant to the keys.   Conat's core pub/sub/request/
reply model is very similar to NATS, but the analogue of Jetstream is
different because I don't find Jetstream useful at all, and find this
much more useful.
  
DEVELOPMENT:

~/cocalc/src/packages/backend$ node


    require('@cocalc/backend/conat'); a = require('@cocalc/conat/sync/core-stream'); s = await a.stream({name:'test', leader:true})


Testing two at once (a leader and non-leader):

    require('@cocalc/backend/conat'); s = await require('@cocalc/backend/conat/sync').dstream({ephemeral:true,name:'test', leader:1, noAutosave:true}); t = await require('@cocalc/backend/conat/sync').dstream({ephemeral:true,name:'test', leader:0,noAutosave:true})


With persistence:

   require('@cocalc/backend/conat'); a = require('@cocalc/conat/sync/core-stream'); s = await a.stream({name:'test', project_id:'00000000-0000-4000-8000-000000000000', persist:true})
   
*/

import {
  type FilteredStreamLimitOptions,
  enforceLimits,
  enforceRateLimits,
  ENFORCE_LIMITS_THROTTLE_MS,
} from "./limits";
import { EventEmitter } from "events";
import {
  type Subscription,
  Message,
  type Headers,
  messageData,
} from "@cocalc/conat/core/client";
import { isNumericString } from "@cocalc/util/misc";
import type { JSONValue } from "@cocalc/util/types";
import { encodeBase64 } from "@cocalc/conat/util";
import refCache from "@cocalc/util/refcache";
import { streamSubject } from "@cocalc/conat/names";
import { getEnv } from "@cocalc/conat/client";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { throttle } from "lodash";
import { once } from "@cocalc/util/async-utils";
import { callback, delay } from "awaiting";
import { randomId } from "@cocalc/conat/names";
import * as persistClient from "@cocalc/conat/persist/client";
import type { Client } from "@cocalc/conat/core/client";
import jsonStableStringify from "json-stable-stringify";

// when this many bytes of key:value have been changed (so need to be freed),
// we do a garbage collection pass.
export const KEY_GC_THRESH = 10 * 1e6;

export interface RawMsg extends Message {
  timestamp: number;
  seq: number;
  sessionId: string;
  key?: string;
}

const HEADER_PREFIX = "CoCalc-";

export const COCALC_MESSAGE_ID_HEADER = `${HEADER_PREFIX}Msg-Id`;
export const COCALC_TOMBSTONE_HEADER = `${HEADER_PREFIX}Tombstone`;
export const COCALC_STREAM_HEADER = `${HEADER_PREFIX}Stream`;
export const COCALC_OPTIONS_HEADER = `${HEADER_PREFIX}Options`;
export const COCALC_HEARTBEAT_HEADER = `${HEADER_PREFIX}Heartbeat`;

const PUBLISH_TIMEOUT = 7500;

const DEFAULT_HEARTBEAT_INTERVAL = 30 * 1000;

export interface CoreStreamOptions {
  // what it's called
  name: string;
  // where it is located
  account_id?: string;
  project_id?: string;
  // note: rate limits are only supported right now for string messages.
  limits?: Partial<FilteredStreamLimitOptions>;
  // only load historic messages starting at the given seq number.
  start_seq?: number;
  desc?: JSONValue;
  leader?: boolean;
  persist?: boolean;

  client?: Client;

  noCache?: boolean;
  heartbeatInterval?: number;
}

interface User {
  account_id?: string;
  project_id?: string;
}

export class CoreStream<T = any> extends EventEmitter {
  public readonly name: string;
  private readonly subject: string;
  private readonly limits: FilteredStreamLimitOptions;
  private _start_seq?: number;

  // don't do "this.raw=" or "this.messages=" anywhere in this class
  // because dstream directly references the public raw/messages.
  public readonly raw: RawMsg[] = [];
  public readonly messages: T[] = [];
  public readonly kv: { [key: string]: { mesg: T; raw: RawMsg } } = {};
  private kvChangeBytes = 0;

  private readonly msgIDs = new Set<any>();
  private sub?: Subscription;
  private leader: boolean;
  private persist: boolean;
  private server?: Subscription;
  // ephemeralSeq = sequence number used by the *leader* only to assign sequence numbers
  private ephemeralSeq: number = 1;
  private lastHeartbeat: number = 0;
  private heartbeatInterval: number;
  // lastSeq used by clients to keep track of what they have received; if one
  // is skipped they reconnect starting with the last one they didn't miss.
  private lastSeq: number = 0;
  private sendQueue: { data; options?; seq: number; cb: Function }[] = [];
  private bytesSent: { [time: number]: number } = {};
  private user: User;
  private persistStream?;
  private storage?: persistClient.Storage;
  private client?: Client;

  private renewLoopParams: { id: string; lifetime: number; user: User } | null =
    null;

  private sessionId?: string;

  constructor({
    name,
    project_id,
    account_id,
    limits,
    start_seq,
    leader = false,
    persist = false,
    client,
    heartbeatInterval = DEFAULT_HEARTBEAT_INTERVAL,
  }: CoreStreamOptions) {
    super();

    this.client = client;
    this.user = { account_id, project_id };
    this.heartbeatInterval = heartbeatInterval;
    this.name = name;
    this.leader = !!leader;
    this.persist = !!persist;
    const subject = streamSubject({ account_id, project_id, ephemeral: true });
    this.subject = subject.replace(">", encodeBase64(name));
    if (persist) {
      let top;
      if (account_id) {
        top = `accounts/${account_id}`;
      } else if (project_id) {
        top = `projects/${project_id}`;
      } else {
        top = "global";
      }
      this.storage = {
        path: `${top}/${name}.db`,
      };
    }
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

  init = async () => {
    if (this.client == null) {
      this.client = (await getEnv()).cn;
    }
    if (this.persist) {
      await this.getAllFromPersist({
        start_seq: this._start_seq,
        noEmit: true,
      });
    } else if (!this.leader) {
      // try to get current data from a leader
      await this.getAllFromLeader({
        start_seq: this._start_seq ?? 0,
        noEmit: true,
      });
    } else {
      // non-persist mode and we are the leader, so
      // start listening on the subject for new data
      await this.serve();
    }
    // NOTE: if we miss a message between getAllFromLeader and when we start listening,
    // then the sequence number will have a gap, and we'll immediately reconnect, starting
    // at the right point. So no data can possibly be lost.
    await this.listen();
    if (!this.leader && !this.persist) {
      this.heartbeatMonitor();
    }
  };

  private resetState = () => {
    delete this.sessionId;
    this.bytesSent = {};
    this.msgIDs.clear();
    this.raw.length = 0;
    this.messages.length = 0;
    this.ephemeralSeq = 0;
    this.sendQueue.length = 0;
    this.lastSeq = 0;
    delete this._start_seq;
    this.emit("reset");
  };

  private reset = async () => {
    this.resetState();
    await this.reconnect();
  };

  close = () => {
    delete this.client;
    this.renewLoopParams = null;
    this.removeAllListeners();
    // @ts-ignore
    this.sub?.close();
    delete this.sub;
    // @ts-ignore
    this.server?.close();
    delete this.server;
    // @ts-ignore
    delete this.kv;
    // @ts-ignore
    delete this.messages;
    // @ts-ignore
    delete this.raw;
    // @ts-ignore
    delete this.msgIDs;
    // @ts-ignore
    delete this.sendQueue;
    // @ts-ignore
    delete this.bytesSent;
    // @ts-ignore
    delete this.storage;
  };

  private getAllFromPersist = async ({
    start_seq = 0,
    noEmit,
  }: { start_seq?: number; noEmit?: boolean } = {}) => {
    if (this.leader) {
      throw Error("leader is incompatible with persist");
    }
    if (!this.persist) {
      throw Error("must have persist set");
    }

    if (this.storage == null) {
      throw Error("bug -- storage must be set");
    }

    const { id, lifetime, stream } = await persistClient.getAll({
      user: this.user,
      storage: this.storage,
      start_seq,
    });
    if (id && lifetime) {
      this.renewLoopParams = { id, lifetime, user: this.user };
      this.startRenewLoop();
    }
    //console.log("got persistent stream", { id });
    this.persistStream = stream;
    while (true) {
      const { value, done } = await stream.next();
      if (done || value == null) {
        return;
      }
      const m = value as Message;
      if (m.headers == null) {
        throw Error("missing header");
      }
      // @ts-ignore
      if (m.headers?.content?.state == "watch") {
        // switched to watch mode
        return;
      }
      this.processPersistentMessage(value, !!noEmit);
    }
  };

  private startRenewLoop = reuseInFlight(async () => {
    while (this.renewLoopParams?.lifetime && this.renewLoopParams?.id) {
      // max to avoid weird situation bombarding server or infinite loop
      await delay(Math.max(7500, this.renewLoopParams.lifetime / 3));
      if (this.renewLoopParams == null) {
        return;
      }
      //console.log("renewing with lifetime ", this.renewLoopParams.lifetime);
      try {
        await persistClient.renew(this.renewLoopParams);
      } catch (err) {
        console.log(`WARNING: core-stream renew failed -- ${err}`);
      }
    }
  });

  private processPersistentMessage = (m: Message, noEmit: boolean) => {
    if (this.raw === undefined) {
      // closed
      return;
    }
    if (m.headers == null) {
      throw Error("missing header");
    }
    const { key, time, headers } = m.headers;
    // @ts-ignore
    const seq = headers?.seq;
    if (typeof seq != "number") {
      throw Error("seq must be a number");
    }
    // question: calling m.data costs time and memory usage; can
    // or should we avoid it until needed?
    const mesg = m.data;
    const raw = {
      timestamp: time,
      headers: (headers as any)?.headers,
      seq,
      raw: m.raw,
      key,
    } as RawMsg;
    if (seq > (this.raw.slice(-1)[0]?.seq ?? 0)) {
      // easy fast initial load at the end (common special case)
      this.messages.push(mesg);
      this.raw.push(raw);
    } else {
      // [ ] TODO: insert in the correct place.  This should only
      // happen when calling load.  The algorithm below is
      // dumb and could be replaced by a binary search.  However, we'll
      // change how we batch load so there's no point.
      let i = 0;
      while (i < this.raw.length && this.raw[i].seq < seq) {
        i += 1;
      }
      this.raw.splice(i, 0, raw);
      this.messages.splice(i, 0, mesg);
    }
    let prev: T | undefined = undefined;
    if (typeof key == "string") {
      prev = this.kv[key]?.mesg;
      if (raw.headers?.[COCALC_TOMBSTONE_HEADER]) {
        delete this.kv[key];
      } else {
        if (this.kv[key] !== undefined) {
          const { raw } = this.kv[key];
          this.kvChangeBytes += raw.raw.length;
        }

        this.kv[key] = { raw, mesg };

        if (this.kvChangeBytes >= KEY_GC_THRESH) {
          this.gcKv();
        }
      }
    }
    this.lastSeq = Math.max(this.lastSeq, seq);
    if (!noEmit) {
      this.emit("change", mesg, raw, key, prev);
    }
  };

  private getAllFromLeader = async ({
    start_seq = 0,
    noEmit,
  }: { maxWait?: number; start_seq?: number; noEmit?: boolean } = {}) => {
    if (this.leader) {
      throw Error("this is the leader");
    }
    // be agressive about initial retrying since the leader
    // might just not be ready yet... but quickly back off.
    // TODO: maybe we should add a primitive to the server
    // that is client.waitUntilSubscriber('subject', {queue:?}) that
    // waits until there is at least one subscribe to the given subject
    // and only then sends a message.  It would be doable, with a check
    // each time the interest is updated.
    let d = 250;
    while (this.client != null) {
      try {
        const resp = await this.client.request(this.subject + ".all", {
          start_seq,
        });
        this.lastHeartbeat = Date.now();
        for (const x of resp.data) {
          const raw = getRawMsg(new Message(x));
          if (
            !this.leader &&
            this.sessionId &&
            this.sessionId != raw.sessionId
          ) {
            await this.reset();
            return;
          } else if (this.lastSeq && raw.seq > this.lastSeq + 1) {
            await this.reconnect();
            return;
          } else if (raw.seq <= this.lastSeq) {
            // already saw this
            continue;
          }
          if (!this.sessionId) {
            this.sessionId = raw.sessionId;
          }
          this.lastSeq = raw.seq;
          const mesg = raw.data;
          this.messages.push(mesg);
          this.raw.push(raw);
          if (!noEmit) {
            this.emit("change", mesg, raw);
          }
        }
        return;
      } catch (err) {
        if (err.code == 503) {
          // leader just isn't ready yet?
          await delay(d);
          d = Math.min(15000, d * 1.5);
          continue;
        } else {
          throw err;
        }
      }
    }
  };

  private serve = async () => {
    if (this.client == null) {
      throw Error("closed");
    }
    this.sessionId = randomId();
    this.sendHeartbeats();
    this.server = await this.client.subscribe(this.subject + ".>");
    this.serveUntilDone(this.server);
  };

  private serveUntilDone = async (sub) => {
    for await (const raw of sub) {
      if (raw.subject.endsWith(".all")) {
        // batch get

        const { start_seq = 0 } = raw.data ?? {};

        // put exactly the entire data the client needs to get updated
        // into a single payload
        const payload = this.raw
          .filter(({ seq }) => seq >= start_seq)
          .map(({ headers, encoding, raw }) => {
            return { headers, encoding, raw };
          });

        // send it out as a single response.
        raw.respond(payload);
      } else if (raw.subject.endsWith(".send")) {
        // single send:  ([ ] TODO need to support a batch send)

        const options = raw.headers?.[COCALC_OPTIONS_HEADER];
        let resp;
        try {
          resp = await this.sendAsLeader(raw.data, options);
        } catch (err) {
          raw.respond({ error: `${err}` });
          return;
        }
        raw.respond(resp);
      }
    }
  };

  private sendHeartbeats = async () => {
    while (this.client != null) {
      const now = Date.now();
      const wait = this.heartbeatInterval - (now - this.lastHeartbeat);
      if (wait > 100) {
        await delay(wait);
      } else {
        const now = Date.now();
        this.client.publish(this.subject, null, {
          headers: { [COCALC_HEARTBEAT_HEADER]: true },
        });
        this.lastHeartbeat = now;
        await delay(this.heartbeatInterval);
      }
    }
  };

  private heartbeatMonitor = async () => {
    while (this.client != null) {
      if (Date.now() - this.lastHeartbeat >= 2.1 * this.heartbeatInterval) {
        try {
          await this.reconnect();
        } catch {}
      }
      await delay(this.heartbeatInterval);
    }
  };

  private listen = async () => {
    if (this.client == null) {
      return;
    }
    if (this.persist) {
      this.listenLoopPersist();
      return;
    } else {
      this.sub = await this.client.subscribe(this.subject);
      this.listenLoop();
    }
    this.enforceLimits();
  };

  private listenLoopPersist = async () => {
    if (this.persistStream == null) {
      throw Error("persistentStream must be defined");
    }
    for await (const m of this.persistStream) {
      try {
        this.processPersistentMessage(m, false);
      } catch (err) {
        console.trace(`WARNING: issue processing persistent message -- ${err}`);
      }
    }
  };

  private listenLoop = async () => {
    if (this.sub == null) {
      throw Error("subscription must be setup");
    }
    for await (const raw0 of this.sub) {
      if (!this.leader) {
        this.lastHeartbeat = Date.now();
      }
      if (raw0.data == null && raw0.headers?.[COCALC_HEARTBEAT_HEADER]) {
        // it's a heartbeat probe
        continue;
      }
      const raw = getRawMsg(raw0);
      if (!this.leader && this.sessionId && this.sessionId != raw.sessionId) {
        await this.reset();
        return;
      } else if (!this.leader && this.lastSeq && raw.seq > this.lastSeq + 1) {
        await this.reconnect();
        return;
      } else if (raw.seq <= this.lastSeq) {
        // already saw this
        continue;
      }
      if (!this.sessionId) {
        this.sessionId = raw.sessionId;
      }
      // move sequence number forward one and record the data
      this.lastSeq = raw.seq;
      const mesg = raw.data;
      this.messages.push(mesg);
      this.raw.push(raw);
      this.lastSeq = raw.seq;
      this.emit("change", mesg, raw);
    }
  };

  private reconnect = reuseInFlight(async () => {
    if (this.leader) {
      // leader doesn't have a notion of reconnect -- it is the one that
      // gets connected to
      return;
    }
    // @ts-ignore
    this.sub?.close();
    delete this.sub;
    if (this.persist) {
      await this.getAllFromPersist({
        start_seq: this.lastSeq + 1,
        noEmit: false,
      });
    } else {
      await this.getAllFromLeader({
        start_seq: this.lastSeq + 1,
        noEmit: false,
      });
    }
    this.listen();
  });

  publish = async (
    mesg: T,
    options?: {
      // headers for this message
      headers?: Headers;
      // unique id for this message to dedup so if you send the same
      // message more than once with the same id it doesn't get published
      // multiple times.
      msgID?: string;
      // key -- if specified a key field is also stored on the server,
      // and any previous messages with the same key are deleted. Also,
      // an entry is set in this.kv[key] so that this.getKv(key), etc. work.
      key?: string;
      // if key is specified and previousSeq is set, the server throws
      // an error if the sequence number of the current key is
      // not previousSeq.  We use this with this.seqKv(key) to
      // provide read/change/write semantics and to know when we
      // should resovle a merge conflict. This is ignored if
      // key is not specified.
      previousSeq?: number;
    },
  ) => {
    if (mesg === undefined) {
      if (options?.key !== undefined) {
        // undefined can't be JSON encoded, so we can't possibly represent it, and this
        // *must* be treated as a delete.
        this.deleteKv(options?.key);
        return;
      } else {
        throw Error("stream non-kv publish - mesg must not be 'undefined'");
      }
    }

    const data = mesg;

    if (typeof mesg == "string") {
      // this may throw an exception preventing publishing.
      enforceRateLimits({
        limits: this.limits,
        bytesSent: this.bytesSent,
        subject: this.subject,
        bytes: mesg.length,
      });
    }
    if (this.persist) {
      if (this.storage == null) {
        throw Error("bug -- storage must be set");
      }
      if (options?.msgID && this.msgIDs.has(options.msgID)) {
        // it's a dup
        return;
      }
      const md = messageData(mesg, {
        headers: {
          ...options?.headers,
          ...(options?.msgID
            ? { [COCALC_MESSAGE_ID_HEADER]: options?.msgID }
            : undefined),
        },
      });
      const x = await persistClient.set({
        user: this.user,
        storage: this.storage,
        key: options?.key,
        messageData: md,
        previousSeq: options?.previousSeq,
      });
      if (options?.msgID) {
        this.msgIDs?.add(options.msgID);
      }
      return x;
    } else if (this.leader) {
      // sending from leader -- so assign seq, timestamp and send it out.
      return await this.sendAsLeader(data, options);
    } else {
      const timeout = 15000; // todo
      // sending as non-leader -- ask leader to send it.
      let headers;
      if (options != null && Object.keys(options).length > 0) {
        headers = { [COCALC_OPTIONS_HEADER]: options };
      } else {
        headers = undefined;
      }
      if (this.client == null) {
        throw Error("closed");
      }
      const resp = await this.client.request(this.subject + ".send", data, {
        headers,
        timeout,
      });
      const r = resp.data;
      if (r?.error) {
        throw Error(r.error);
      }
      return resp;
    }
  };

  private sendAsLeader = async (data, options?): Promise<{ seq: number }> => {
    if (!this.leader) {
      throw Error("must be the leader");
    }
    const seq = this.ephemeralSeq;
    this.ephemeralSeq += 1;
    const f = (cb) => {
      if (this.sendQueue == null) {
        cb();
        return;
      }
      this.sendQueue.push({ data, options, seq, cb });
      this.processQueue();
    };
    await callback(f);
    return { seq };
  };

  private processQueue = reuseInFlight(async () => {
    if (!this.leader) {
      throw Error("must be the leader");
    }
    if (this.sendQueue == null) {
      return;
    }
    const { sessionId } = this;
    while (
      (this.sendQueue?.length ?? 0) > 0 &&
      this.client != null &&
      this.sessionId == sessionId
    ) {
      const x = this.sendQueue.shift();
      if (x == null) {
        continue;
      }
      const { data, options, seq, cb } = x;
      if (options?.msgID && this.msgIDs.has(options?.msgID)) {
        // it's a dup of one already successfully sent before -- dedup by ignoring.
        cb();
        continue;
      }
      if (this.client == null) {
        cb("closed");
        return;
      }
      const timestamp = Date.now();
      const headers = {
        [COCALC_STREAM_HEADER]: {
          seq,
          timestamp,
          sessionId: this.sessionId,
        },
        [COCALC_MESSAGE_ID_HEADER]: options?.msgID,
      } as any;
      if (options?.headers) {
        for (const k in options.headers) {
          headers[k] = options.headers[k];
        }
      }
      // we publish it until we get it as a change event, and only
      // then do we respond, being sure it was sent.
      const now = Date.now();
      while (this.client != null && this.sessionId == sessionId) {
        // critical to use publishSync here so that we are waiting
        // for the "change" below *before* it happens.
        this.client.publishSync(this.subject, data, { headers });
        const start = Date.now();
        let done = false;
        try {
          while (
            Date.now() - start <= PUBLISH_TIMEOUT &&
            this.sessionId == sessionId
          ) {
            const [_, raw] = await once(this, "change", PUBLISH_TIMEOUT);
            if (raw?.seq == seq) {
              done = true;
              break;
            }
          }
          if (done && options?.msgID) {
            this.msgIDs.add(options.msgID);
          }
          cb(done ? undefined : "timeout");
          break;
        } catch (err) {
          console.warn(`Error processing sendQueue -- ${err}`);
          cb(`${err}`);
          break;
        }
      }
      if (now > this.lastHeartbeat) {
        this.lastHeartbeat = now;
      }
    }
  });

  get = (n?): T | T[] => {
    if (n == null) {
      return this.getAll();
    } else {
      return this.messages[n];
    }
  };

  seq = (n: number): number | undefined => {
    return this.raw[n]?.seq;
  };

  getAll = (): T[] => {
    return [...this.messages];
  };

  get length(): number {
    return this.messages.length;
  }

  get start_seq(): number | undefined {
    return this._start_seq;
  }

  headers = (n: number): { [key: string]: any } | undefined => {
    return this.raw[n]?.headers;
  };

  // key:value interface for subset of messages pushed with key option set.
  // NOTE: This does NOT throw an error if our local seq is out of date (leave that
  // to dkv built on this).
  setKv = async (
    key: string,
    mesg: T,
    options?: {
      headers?: Headers;
      previousSeq?: number;
    },
  ) => {
    return await this.publish(mesg, { ...options, key });
  };

  deleteKv = async (key: string, options?: { msgID?: string }) => {
    if (this.kv[key] === undefined) {
      // nothing to do
      return;
    }
    return await this.publish(null as any, {
      ...options,
      headers: { [COCALC_TOMBSTONE_HEADER]: true },
      key,
    });
  };

  getKv = (key: string): T | undefined => {
    return this.kv[key]?.mesg;
  };

  hasKv = (key: string): boolean => {
    return this.kv?.[key] !== undefined;
  };

  getAllKv = (): { [key: string]: T } => {
    const all: { [key: string]: T } = {};
    for (const key in this.kv) {
      all[key] = this.kv[key].mesg;
    }
    return all;
  };

  seqKv = (key: string): number | undefined => {
    return this.kv[key]?.raw.seq;
  };

  timeKv = (key?: string): Date | { [key: string]: Date } | undefined => {
    if (key === undefined) {
      const all: { [key: string]: Date } = {};
      for (const key in this.kv) {
        all[key] = new Date(this.kv[key].raw.timestamp);
      }
      return all;
    }
    const r = this.kv[key]?.raw;
    if (r == null) {
      return;
    }
    return new Date(r.timestamp);
  };

  headersKv = (key: string): { [key: string]: any } | undefined => {
    return this.kv[key]?.raw?.headers;
  };

  get lengthKv(): number {
    return Object.keys(this.kv).length;
  }

  // load older messages starting at start_seq up to the oldest message
  // we currently have.
  load = async ({
    start_seq,
    noEmit,
  }: {
    start_seq: number;
    noEmit?: boolean;
  }) => {
    if (this.persist) {
      // This is used for loading more TimeTravel history
      if (this.storage == null) {
        throw Error("bug");
      }
      // this is one before the oldest we have
      const end_seq = (this.raw[0]?.seq ?? this._start_seq ?? 1) - 1;
      if (start_seq > end_seq) {
        // nothing to load
        return;
      }
      // we're moving start_seq back to this point
      this._start_seq = start_seq;
      const { stream } = await persistClient.getAll({
        user: this.user,
        storage: this.storage,
        start_seq,
        end_seq,
      });
      for await (const value of stream) {
        this.processPersistentMessage(value, !!noEmit);
      }
      return;
    }

    // Ephemeral case below - lower priority since probably never used:
    // [ ] TODO: this is NOT efficient - it just discards everything and starts over.
    if (this._start_seq == null || this._start_seq <= 1 || this.leader) {
      // we already loaded everything on initialization; there can't be anything older;
      // or we are leader, so we are the full source of truth.
      return;
    }
    const n = this.messages.length;
    this.resetState();
    this._start_seq = start_seq;
    this.lastSeq = start_seq - 1;
    await this.reconnect();
    if (!noEmit) {
      for (let i = 0; i < this.raw.length - n; i++) {
        this.emit("change", this.messages[i], this.raw[i]);
      }
    }
  };

  // get server assigned time of n-th message in stream
  time = (n: number): Date | undefined => {
    const r = this.raw[n];
    if (r == null) {
      return;
    }
    return new Date(r.timestamp);
  };

  times = () => {
    const v: (Date | undefined)[] = [];
    for (let i = 0; i < this.length; i++) {
      v.push(this.time(i));
    }
    return v;
  };

  stats = ({
    start_seq = 1,
  }: {
    start_seq?: number;
  } = {}): { count: number; bytes: number } | undefined => {
    if (this.raw == null) {
      return;
    }
    let count = 0;
    let bytes = 0;
    for (const { raw, seq } of this.raw) {
      if (seq == null) {
        continue;
      }
      if (seq < start_seq) {
        continue;
      }
      count += 1;
      bytes += raw.length;
    }
    return { count, bytes };
  };

  // delete all messages up to and including the
  // one at position index, i.e., this.messages[index]
  // is deleted.
  // NOTE: other clients will NOT see the result of a purge.
  purge = async ({ index = -1 }: { index?: number } = {}) => {
    if (this.persist) {
      // [ ] TODO:
      return;
    }
    if (index >= this.raw.length - 1 || index == -1) {
      index = this.raw.length - 1;
    }
    this.messages.splice(0, index + 1);
    this.raw.splice(0, index + 1);
  };

  private enforceLimitsNow = reuseInFlight(async () => {
    if (this.persist) {
      // [ ] TODO:
      return;
    }
    // ephemeral limits are enforced by all clients.
    const index = enforceLimits({
      messages: this.messages,
      // @ts-ignore [ ] TODO
      raw: this.raw,
      limits: this.limits,
    });
    if (index > -1) {
      try {
        await this.purge({ index });
      } catch (err) {
        if (err.code != "TIMEOUT") {
          console.log(`WARNING: purging old messages - ${err}`);
        }
      }
    }
  });

  private enforceLimits = throttle(
    this.enforceLimitsNow,
    ENFORCE_LIMITS_THROTTLE_MS,
    { leading: false, trailing: true },
  );

  // delete messages that are no longer needed since newer values have been written
  gcKv = () => {
    this.kvChangeBytes = 0;
    for (let i = 0; i < this.raw.length; i++) {
      const key = this.raw[i].key;
      if (key !== undefined) {
        if (this.raw[i].raw.length > 0 && this.raw[i] !== this.kv[key].raw) {
          this.raw[i] = {
            ...this.raw[i],
            headers: undefined,
            raw: Buffer.from(""),
          } as RawMsg;
          this.messages[i] = undefined as T;
        }
      }
    }
  };
}

export const cache = refCache<CoreStreamOptions, CoreStream>({
  name: "core-stream",
  createObject: async (options: CoreStreamOptions) => {
    const estream = new CoreStream(options);
    await estream.init();
    return estream;
  },
  createKey: ({ client, ...options }) => {
    return jsonStableStringify(options);
  },
});
export async function cstream<T>(
  options: CoreStreamOptions,
): Promise<CoreStream<T>> {
  return await cache(options);
}

function getRawMsg(raw: Message): RawMsg {
  const {
    seq = 0,
    timestamp = 0,
    sessionId = "",
  } = (raw.headers?.[COCALC_STREAM_HEADER] ?? {}) as any;
  if (!seq) {
    throw Error("missing seq header");
  }
  if (!timestamp) {
    throw Error("missing timestamp header");
  }
  // @ts-ignore
  raw.seq = seq;
  // @ts-ignore
  raw.timestamp = timestamp;
  // @ts-ignore
  raw.sessionId = sessionId;
  // @ts-ignore
  return raw;
}
