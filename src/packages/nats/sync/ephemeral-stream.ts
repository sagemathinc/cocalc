/*
An Ephemeral Stream

DEVELOPMENT:

~/cocalc/src/packages/backend$ node
...

    require('@cocalc/backend/nats'); a = require('@cocalc/nats/sync/ephemeral-stream'); s = await a.estream({name:'test', leader:true})

*/

import { type FilteredStreamLimitOptions, last } from "./stream";
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

export interface RawMsg extends Msg {
  cocalc_timestamp: number;
  seq: number;
}

export const ENFORCE_LIMITS_THROTTLE_MS = process.env.COCALC_TEST_MODE
  ? 100
  : 45000;

const COCALC_SEQUENCE_HEADER = "CoCalc-Seq";
const COCALC_TIMESTAMP_HEADER = "CoCalc-Timestamp";

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

  noCache?: boolean;
}

export class EphemeralStream<T = any> extends EventEmitter {
  public readonly name: string;
  private readonly subject: string;
  private readonly apiSubject: string;
  private readonly limits: FilteredStreamLimitOptions;
  private _start_seq?: number;
  public readonly valueType: ValueType;
  // don't do "this.raw=" or "this.messages=" anywhere in this class!!!
  public readonly raw: RawMsg[][] = [];
  public readonly messages: T[] = [];

  private env?: NatsEnv;
  private sub?: Subscription;
  private leader: boolean;
  private server?: Subscription;
  private seq: number = 1;

  constructor({
    name,
    project_id,
    account_id,
    limits,
    start_seq,
    valueType = "json",
    leader = false,
  }: EphemeralStreamOptions) {
    super();

    this.valueType = valueType;
    this.name = name;
    this.leader = !!leader;
    const subjects = streamSubject({ account_id, project_id, ephemeral: true });
    this.subject = subjects.replace(">", encodeBase64(name));
    this.apiSubject = this.subject + '.api";';
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
    if (!this.leader) {
      // try to get current data from a leader
      await this.getAllFromLeader();
    } else {
      // start listening on the subject for new data
      this.serve();
    }
    // there can be dropped messages between when getAllFromLeader is called
    // and this listen.  We'll fix that with sequence numbers...
    this.listen();
  };

  close = () => {
    this.removeAllListeners();
    // @ts-ignore
    this.sub?.close();
    delete this.sub;
    // @ts-ignore
    this.server?.close();
    delete this.server;
  };

  private getAllFromLeader = async ({ maxWait = 30000 }: { maxWait? } = {}) => {
    if (this.env == null) {
      throw Error("closed");
    }
    await waitUntilConnected();
    for await (const raw of await this.env.nc.requestMany(
      this.apiSubject,
      this.env.jc.encode("get-all"),
      { maxWait },
    )) {
      if (raw.data.length == 0) {
        // done
        return;
      }
      const mesg = this.decodeValue(raw.data);
      this.messages.push(mesg);
      this.raw.push([getRawMsg(raw)]);
    }
  };

  private serve = async () => {
    if (this.env == null) {
      throw Error("closed");
    }
    this.server = this.env.nc.subscribe(this.apiSubject);
    for await (const raw of this.server) {
      const mesg = this.env.jc.decode(raw.data);
      if (mesg === "get-all") {
        for (const m of this.raw) {
          raw.respond(m[0].data, { headers: m[0].headers });
        }
        raw.respond(Empty);
      } else if (mesg == "create") {
        raw.respond(this.env.jc.encode(await this.create()));
      }
    }
  };

  private create = async () => {
    if (this.env == null) {
      throw Error("closed");
    }
    if (this.leader) {
      // we are the leader
      const seq = this.seq;
      this.seq += 1;
      return { seq, timestamp: Date.now() };
    } else {
      // we ask the leader
      const resp = await this.env.nc.request(
        this.apiSubject,
        this.env.jc.encode("create"),
      );
      return this.env.jc.decode(resp.data);
    }
  };

  private listen = async () => {
    await waitUntilConnected();
    if (this.env == null) {
      throw Error("closed");
    }
    this.sub = this.env.nc.subscribe(this.subject);
    for await (const raw0 of this.sub) {
      const raw = getRawMsg(raw0);
      const mesg = this.decodeValue(raw.data);
      this.messages.push(mesg);
      this.raw.push([raw]);
      this.emit("change", mesg, [raw]);
    }
    this.enforceLimits();
  };

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
    options?: Partial<{ headers: { [key: string]: string } }>,
  ) => {
    await waitUntilConnected();
    if (this.env == null) {
      throw Error("closed");
    }
    const { seq, timestamp } = await this.create();
    const data = this.encodeValue(mesg);
    const headers = createHeaders();
    if (options?.headers) {
      for (const k in options.headers) {
        headers.append(k, `${options.headers[k]}`);
      }
    }
    headers.append(COCALC_SEQUENCE_HEADER, `${seq}`);
    headers.append(COCALC_TIMESTAMP_HEADER, `${timestamp}`);
    this.env.nc.publish(this.subject, data, { headers });
    const resp = { seq };
    this.seq += 1;
    return resp;
  };

  get = (n?): T | T[] => {
    if (n == null) {
      return this.getAll();
    } else {
      return this.messages[n][0];
    }
  };

  getAll = () => {
    return this.messages.map((x) => x[0]);
  };

  get length(): number {
    return this.messages.length;
  }

  get start_seq(): number | undefined {
    return this._start_seq;
  }

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

  load = () => {
    throw Error("load not implemented");
  };

  // get server assigned time of n-th message in stream
  time = (n: number): Date | undefined => {
    const r = last(this.raw[n]);
    if (r == null) {
      return;
    }
    return new Date(r.cocalc_timestamp);
  };

  times = () => {
    const v: (Date | undefined)[] = [];
    for (let i = 0; i < this.length; i++) {
      v.push(this.time(i));
    }
    return v;
  };

  stats = () => {
    throw Error("stats not implemented");
  };

  // delete all messages up to and including the
  // one at position index, i.e., this.messages[index]
  // is deleted.
  // NOTE: other clients will NOT see the result of a purge.
  purge = async ({ index = -1 }: { index?: number } = {}) => {
    if (index >= this.raw.length - 1 || index == -1) {
      index = this.raw.length - 1;
    }
    this.messages.splice(0, index + 1);
    this.raw.splice(0, index + 1);
  };

  private enforceLimitsNow = reuseInFlight(async () => {
    console.log("TODO: enforce limits not implemneted", this.limits);
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
    cocalc_timestamp = 0;
  for (const [key, value] of raw.headers ?? []) {
    if (key == COCALC_SEQUENCE_HEADER) {
      seq = parseInt(value[0]);
      if (cocalc_timestamp) break;
    } else if (key == COCALC_TIMESTAMP_HEADER) {
      cocalc_timestamp = parseFloat(value[0]);
      if (seq) break;
    }
  }
  if (!seq) {
    throw Error("missing seq header");
  }
  if (!cocalc_timestamp) {
    throw Error("missing cocalc_timestamp header");
  }
  // @ts-ignore
  raw.seq = seq;
  // @ts-ignore
  raw.cocalc_timestamp = cocalc_timestamp;
  // @ts-ignore
  return raw;
}
