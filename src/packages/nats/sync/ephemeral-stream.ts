/*
An Ephemeral Stream

DEVELOPMENT:

~/cocalc/src/packages/backend$ node
...

    require('@cocalc/backend/nats'); a = require('@cocalc/nats/sync/ephemeral-stream'); s = await a.estream({name:'test'})
*/

import { type FilteredStreamLimitOptions } from "./stream";
import { type NatsEnv, type ValueType } from "@cocalc/nats/types";
import { EventEmitter } from "events";
import { type Msg } from "@nats-io/nats-core";
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

export const ENFORCE_LIMITS_THROTTLE_MS = process.env.COCALC_TEST_MODE
  ? 100
  : 45000;

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

  noCache?: boolean;
}

export class EphemeralStream<T = any> extends EventEmitter {
  public readonly name: string;
  private readonly subject: string;
  private readonly limits: FilteredStreamLimitOptions;
  private _start_seq?: number;
  public readonly valueType: ValueType;
  // don't do "this.raw=" or "this.messages=" anywhere in this class!!!
  public readonly raw: Msg[][] = [];
  public readonly messages: T[] = [];

  private env?: NatsEnv;
  private sub?;

  constructor({
    name,
    project_id,
    account_id,
    limits,
    start_seq,
    valueType = "json",
  }: EphemeralStreamOptions) {
    super();

    this.valueType = valueType;
    this.name = name;
    const subjects = streamSubject({ account_id, project_id });
    this.subject = subjects.replace(">", encodeBase64(name));
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
    // start listening on the subject
    this.listen();
  };

  close = () => {
    this.removeAllListeners();
    this.sub?.close();
    delete this.sub;
  };

  private listen = async () => {
    await waitUntilConnected();
    if (this.env == null) {
      throw Error("closed");
    }
    this.sub = this.env.nc.subscribe(this.subject);
    for await (const raw of this.sub) {
      const mesg = this.decodeValue(raw.data);
      this.messages.push(mesg);
      this.raw.push([raw]);
      this.emit("change", mesg, raw);
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
    const data = this.encodeValue(mesg);
    let headers;
    if (options?.headers) {
      headers = createHeaders();
      for (const k in options.headers) {
        headers.append(k, `${options.headers[k]}`);
      }
    } else {
      headers = undefined;
    }
    const resp = await this.env.nc.publish(this.subject, data, { headers });
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
