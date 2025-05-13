/*
An Ephemeral Stream

DEVELOPMENT:

~/cocalc/src/packages/backend$ node


    require('@cocalc/backend/nats'); a = require('@cocalc/nats/sync/ephemeral-stream'); s = await a.estream({name:'test', leader:true})


Testing two at once (a leader and non-leader):

    require('@cocalc/backend/nats'); s = await require('@cocalc/backend/nats/sync').dstream({ephemeral:true,name:'test', leader:1, noAutosave:true}); t = await require('@cocalc/backend/nats/sync').dstream({ephemeral:true,name:'test', leader:0,noAutosave:true})


With persistence:

   require('@cocalc/backend/nats'); a = require('@cocalc/nats/sync/ephemeral-stream'); s = await a.estream({name:'test', project_id:'00000000-0000-4000-8000-000000000000', persist:true})
   
*/

import {
  type FilteredStreamLimitOptions,
  last,
  enforceLimits,
  enforceRateLimits,
  headersFromRawMessages,
} from "./stream";
import { type NatsEnv, type ValueType } from "@cocalc/nats/types";
import { EventEmitter } from "events";
import { Empty, type Msg, type Subscription } from "@nats-io/nats-core";
import { isNumericString } from "@cocalc/util/misc";
import type { JSONValue } from "@cocalc/util/types";
import {
  // getMaxPayload,
  waitUntilConnected,
  encodeBase64,
} from "@cocalc/nats/util";
import refCache from "@cocalc/util/refcache";
import { streamSubject } from "@cocalc/nats/names";
import { getEnv } from "@cocalc/nats/client";
import { headers as createHeaders } from "@nats-io/nats-core";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { throttle } from "lodash";
import { once } from "@cocalc/util/async-utils";
import { callback, delay } from "awaiting";
import { randomId } from "@cocalc/nats/names";
import * as persistClient from "@cocalc/nats/persist/client";

export interface RawMsg extends Msg {
  timestamp: number;
  seq: number;
  sessionId: string;
}

export const ENFORCE_LIMITS_THROTTLE_MS = process.env.COCALC_TEST_MODE
  ? 100
  : 45000;

const HEADER_PREFIX = "CoCalc-";

const COCALC_SEQUENCE_HEADER = `${HEADER_PREFIX}Seq`;
const COCALC_TIMESTAMP_HEADER = `${HEADER_PREFIX}Timestamp`;
const COCALC_OPTIONS_HEADER = `${HEADER_PREFIX}Options`;
const COCALC_SESSION_ID_HEADER = `${HEADER_PREFIX}Session-Id`;
export const COCALC_MESSAGE_ID_HEADER = `${HEADER_PREFIX}Msg-Id`;

const PUBLISH_TIMEOUT = 7500;

const DEFAULT_HEARTBEAT_INTERVAL = 30 * 1000;

export interface EphemeralStreamOptions {
  // what it's called
  name: string;
  // where it is located
  account_id?: string;
  project_id?: string;
  limits?: Partial<FilteredStreamLimitOptions>;
  // only load historic messages starting at the given seq number.
  start_seq?: number;
  desc?: JSONValue;
  valueType?: ValueType;
  leader?: boolean;
  persist?: boolean;

  noCache?: boolean;
  heartbeatInterval?: number;
}

export class EphemeralStream<T = any> extends EventEmitter {
  public readonly name: string;
  private readonly subject: string;
  private readonly limits: FilteredStreamLimitOptions;
  private _start_seq?: number;
  public readonly valueType: ValueType;
  // don't do "this.raw=" or "this.messages=" anywhere in this class!!!
  public readonly raw: RawMsg[][] = [];
  public readonly messages: T[] = [];
  private readonly msgIDs = new Set<any>();

  private env?: NatsEnv;
  private sub?: Subscription;
  private leader: boolean;
  private persist: boolean;
  private server?: Subscription;
  // seq used by the *leader* only to assign sequence numbers
  private seq: number = 1;
  private lastHeartbeat: number = 0;
  private heartbeatInterval: number;
  // lastSeq used by clients to keep track of what they have received; if one
  // is skipped they reconnect starting with the last one they didn't miss.
  private lastSeq: number = 0;
  private sendQueue: { data; options?; seq: number; cb: Function }[] = [];
  private bytesSent: { [time: number]: number } = {};
  private user;
  private persistStream?;
  private storage?: persistClient.Storage;

  private sessionId?: string;

  constructor({
    name,
    project_id,
    account_id,
    limits,
    start_seq,
    valueType = "json",
    leader = false,
    persist = false,
    heartbeatInterval = DEFAULT_HEARTBEAT_INTERVAL,
  }: EphemeralStreamOptions) {
    super();
    this.user = { account_id, project_id };
    this.valueType = valueType;
    this.heartbeatInterval = heartbeatInterval;
    this.name = name;
    this.leader = !!leader;
    this.persist = !!persist;
    const subjects = streamSubject({ account_id, project_id, ephemeral: true });
    this.subject = subjects.replace(">", encodeBase64(name));
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
    this.env = await getEnv();
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
      // start listening on the subject for new data
      this.serve();
    }
    // NOTE: if we miss a message between getAllFromLeader and when we start listening,
    // then the sequence number will have a gap, and we'll immediately reconnect, starting
    // at the right point. So no data can possibly be lost.
    this.listen();
    if (!this.leader && !this.persist) {
      this.heartbeatMonitor();
    }
    if (this.env?.nc?.on != null) {
      this.env.nc.on("reconnect", this.reconnect);
    }
  };

  private resetState = () => {
    delete this.sessionId;
    this.bytesSent = {};
    this.msgIDs.clear();
    this.raw.length = 0;
    this.messages.length = 0;
    this.seq = 0;
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
    if (this.env?.nc?.removeListener != null) {
      this.env.nc.removeListener("reconnect", this.reconnect);
    }
    delete this.env;
    this.removeAllListeners();
    // @ts-ignore
    this.sub?.close();
    delete this.sub;
    // @ts-ignore
    this.server?.close();
    delete this.server;
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

    // [ ] TODO: just for initial testing!
    if (this.storage == null) {
      throw Error("bug -- storage must be set");
    }
    const { id, stream } = await persistClient.getAll({
      user: this.user,
      storage: this.storage,
      start_seq,
    });
    this.persistStream = stream;
    console.log("getAll got ", { id });
    while (true) {
      const { value, done } = await stream.next();
      if (done) {
        return;
      }
      if (value?.state != "watch") {
        const { seq, time, buffer, json } = value;
        const mesg = this.decodeValue(buffer);
        this.messages.push(mesg);
        // todo typing is wrong
        const raw = {
          timestamp: time,
          headers: json,
          seq,
          data: buffer,
        } as RawMsg;
        this.raw.push([raw]);
        this.lastSeq = seq;
        if (!noEmit) {
          this.emit("change", mesg, [raw]);
        }
      } else {
        // switched to watch mode
        return;
      }
    }
  };

  private getAllFromLeader = async ({
    maxWait = 30000,
    start_seq = 0,
    noEmit,
  }: { maxWait?: number; start_seq?: number; noEmit?: boolean } = {}) => {
    if (this.leader) {
      throw Error("this is the leader");
    }
    let d = 1000;
    while (this.env != null) {
      await waitUntilConnected();
      if (this.env == null) {
        return;
      }
      // console.log("getAllFromLeader", { start_seq });
      try {
        for await (const raw0 of await this.env.nc.requestMany(
          this.subject + ".all",
          this.env.jc.encode({ start_seq }),
          { maxWait },
        )) {
          this.lastHeartbeat = Date.now();
          if (raw0.data.length == 0) {
            // done
            return;
          }
          const raw = getRawMsg(raw0);
          if (
            !this.leader &&
            this.sessionId &&
            this.sessionId != raw.sessionId
          ) {
            await this.reset();
            return;
          } else if (this.lastSeq && raw.seq > this.lastSeq + 1) {
            // console.log("skipped a sequence number - reconnecting");
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
          const mesg = this.decodeValue(raw.data);
          this.messages.push(mesg);
          this.raw.push([raw]);
          if (!noEmit) {
            this.emit("change", mesg, [raw]);
          }
        }
        return;
      } catch (err) {
        // console.log(`err connecting -- ${err}`);
        if (err.code == "503") {
          // leader just isn't ready yet
          d = Math.min(15000, d * 1.3);
          await delay(d);
          continue;
        } else {
          throw err;
        }
      }
    }
  };

  private serve = async () => {
    if (this.env == null) {
      throw Error("closed");
    }
    this.sessionId = randomId();
    this.sendHeartbeats();
    this.server = this.env.nc.subscribe(this.subject + ".>");
    for await (const raw of this.server) {
      if (raw.subject.endsWith(".all")) {
        const { start_seq = 0 } = this.env.jc.decode(raw.data) ?? {};
        for (const [m] of this.raw) {
          if (m.seq >= start_seq) {
            raw.respond(m.data, { headers: m.headers });
          }
        }
        raw.respond(Empty);
        continue;
      } else if (raw.subject.endsWith(".send")) {
        let options: any = undefined;
        if (raw.headers) {
          for (const [key, value] of raw.headers) {
            if (key == COCALC_OPTIONS_HEADER) {
              options = JSON.parse(value[0]);
              break;
            }
          }
        }
        let resp;
        try {
          resp = await this.sendAsLeader(raw.data, options);
        } catch (err) {
          raw.respond(this.env.jc.encode({ error: `${err}` }));
          return;
        }
        raw.respond(this.env.jc.encode(resp));
        continue;
      }
    }
  };

  private sendHeartbeats = async () => {
    while (this.env != null) {
      await waitUntilConnected();
      const now = Date.now();
      const wait = this.heartbeatInterval - (now - this.lastHeartbeat);
      if (wait > 100) {
        await delay(wait);
      } else {
        const now = Date.now();
        this.env.nc.publish(this.subject, Empty);
        this.lastHeartbeat = now;
        await delay(this.heartbeatInterval);
      }
    }
  };

  private heartbeatMonitor = async () => {
    while (this.env != null) {
      if (Date.now() - this.lastHeartbeat >= 2.1 * this.heartbeatInterval) {
        try {
          // console.log("skipped a heartbeat -- reconnecting");
          await this.reconnect();
        } catch {}
      }
      await delay(this.heartbeatInterval);
    }
  };

  private listen = async () => {
    await waitUntilConnected();
    if (this.env == null) {
      return;
    }
    if (this.persist) {
      if (this.persistStream == null) {
        throw Error("persistentStream must be defined");
      }
      console.log("listening...");
      for await (const x of this.persistStream) {
        const { seq, time, buffer, json } = x;
        if (!seq) {
          // TODO
          return;
        }
        // TODO: wrong typing
        const raw = {
          timestamp: time,
          headers: json,
          seq,
          data: buffer,
        } as RawMsg;
        this.lastSeq = raw.seq;
        const mesg = this.decodeValue(buffer);
        this.messages.push(mesg);
        this.raw.push([raw]);
        this.lastSeq = raw.seq;
        this.emit("change", mesg, [raw]);
      }
      console.log("finished listening");
      return;
    }
    while (this.env != null) {
      // @ts-ignore
      this.sub?.close();
      this.sub = this.env.nc.subscribe(this.subject);
      try {
        for await (const raw0 of this.sub) {
          if (!this.leader) {
            this.lastHeartbeat = Date.now();
          }
          if (raw0.data.length == 0 && raw0.headers == null) {
            // console.log("received heartbeat");
            // it's a heartbeat probe
            continue;
          }
          const raw = getRawMsg(raw0);
          if (
            !this.leader &&
            this.sessionId &&
            this.sessionId != raw.sessionId
          ) {
            await this.reset();
            return;
          } else if (
            !this.leader &&
            this.lastSeq &&
            raw.seq > this.lastSeq + 1
          ) {
            // console.log("skipped a sequence number - reconnecting");
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
          const mesg = this.decodeValue(raw.data);
          this.messages.push(mesg);
          this.raw.push([raw]);
          this.lastSeq = raw.seq;
          this.emit("change", mesg, [raw]);
        }
      } catch (err) {
        console.log(`Error listening -- ${err}`);
      }
      await delay(3000);
    }
    this.enforceLimits();
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

  private encodeValue = (value: T) => {
    if (this.env == null) {
      throw Error("closed");
    }
    return this.valueType == "json" ? this.env.jc.encode(value) : value;
  };

  private decodeValue = (value): T => {
    if (this.env == null) {
      throw Error("closed");
    }
    return this.valueType == "json" ? this.env.jc.decode(value) : value;
  };

  publish = async (
    mesg: T,
    options?: { headers?: { [key: string]: string }; msgID?: string },
  ) => {
    const data = this.encodeValue(mesg);

    // this may throw an exception:
    enforceRateLimits({
      limits: this.limits,
      bytesSent: this.bytesSent,
      subject: this.subject,
      data,
      mesg,
    });

    if (this.persist) {
      if (this.storage == null) {
        throw Error("bug -- storage must be set");
      }
      return await persistClient.set({
        user: this.user,
        storage: this.storage,
        buffer: this.encodeValue(mesg),
        json: options?.headers,
      });
    } else if (this.leader) {
      // sending from leader -- so assign seq, timestamp and sent it out.
      return await this.sendAsLeader(data, options);
    } else {
      const timeout = 15000; // todo
      // sending as non-leader -- ask leader to send it.
      let headers;
      if (options != null && Object.keys(options).length > 0) {
        headers = createHeaders();
        headers.append(COCALC_OPTIONS_HEADER, JSON.stringify(options));
      } else {
        headers = undefined;
      }
      await waitUntilConnected();
      if (this.env == null) {
        throw Error("closed");
      }
      const resp = await this.env.nc.request(this.subject + ".send", data, {
        headers,
        timeout,
      });
      const r = this.env.jc.decode(resp.data);
      if (r.error) {
        throw Error(r.error);
      }
      return resp;
    }
  };

  private sendAsLeader = async (data, options?): Promise<{ seq: number }> => {
    if (!this.leader) {
      throw Error("must be the leader");
    }
    const seq = this.seq;
    this.seq += 1;
    const f = (cb) => {
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
    const { sessionId } = this;
    while (
      this.sendQueue.length > 0 &&
      this.env != null &&
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
      await waitUntilConnected();
      if (this.env == null) {
        cb("closed");
        return;
      }
      const timestamp = Date.now();
      const headers = createHeaders();
      if (options?.headers) {
        for (const k in options.headers) {
          headers.append(k, `${options.headers[k]}`);
        }
      }
      headers.append(COCALC_SEQUENCE_HEADER, `${seq}`);
      headers.append(COCALC_TIMESTAMP_HEADER, `${timestamp}`);
      if (!this.sessionId) {
        throw Error("sessionId must be set");
      }
      headers.append(COCALC_SESSION_ID_HEADER, this.sessionId);
      if (options?.msgID) {
        headers.append(COCALC_MESSAGE_ID_HEADER, options.msgID);
      }
      // we publish it until we get it as a change event, and only
      // then do we respond, being sure it was sent.
      const now = Date.now();
      while (this.env != null && this.sessionId == sessionId) {
        this.env.nc.publish(this.subject, data, { headers });
        const start = Date.now();
        let done = false;
        try {
          while (
            Date.now() - start <= PUBLISH_TIMEOUT &&
            this.sessionId == sessionId
          ) {
            const [_, raw] = await once(this, "change", PUBLISH_TIMEOUT);
            if (last(raw)?.seq == seq) {
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

  getAll = () => {
    return [...this.messages];
  };

  get length(): number {
    return this.messages.length;
  }

  get start_seq(): number | undefined {
    return this._start_seq;
  }

  headers = (n: number): { [key: string]: string } | undefined => {
    if (this.persist) {
      return last(this.raw[n])?.headers;
    }
    return headersFromRawMessages(this.raw[n]);
  };

  // load older messages starting at start_seq
  load = async ({
    start_seq,
    noEmit,
  }: {
    start_seq: number;
    noEmit?: boolean;
  }) => {
    if (this.persist) {
      // [ ] TODO:
      return;
    }
    if (this._start_seq == null || this._start_seq <= 1 || this.leader) {
      // we already loaded everything on initialization; there can't be anything older;
      // or we are leader, so we are the full source of truth.
      return;
    }
    // this is NOT efficient - it just discards everything and starts over.
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
    const r = last(this.raw[n]);
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
    const index = enforceLimits({
      messages: this.messages,
      raw: this.raw,
      limits: this.limits,
    });
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

  private enforceLimits = throttle(
    this.enforceLimitsNow,
    ENFORCE_LIMITS_THROTTLE_MS,
    { leading: false, trailing: true },
  );
}

export const cache = refCache<EphemeralStreamOptions, EphemeralStream>({
  name: "ephemeral-stream",
  createObject: async (options: EphemeralStreamOptions) => {
    const estream = new EphemeralStream(options);
    await estream.init();
    return estream;
  },
});
export async function estream<T>(
  options: EphemeralStreamOptions,
): Promise<EphemeralStream<T>> {
  return await cache(options);
}

function getRawMsg(raw: Msg): RawMsg {
  let seq = 0,
    timestamp = 0,
    sessionId = "";
  for (const [key, value] of raw.headers ?? []) {
    if (key == COCALC_SEQUENCE_HEADER) {
      seq = parseInt(value[0]);
    } else if (key == COCALC_TIMESTAMP_HEADER) {
      timestamp = parseFloat(value[0]);
    } else if (key == COCALC_SESSION_ID_HEADER) {
      sessionId = value[0];
    }
  }
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
