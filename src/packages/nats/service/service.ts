/*
Simple to use UI to connect anything in cocalc via request/reply services.

- callNatsService
- createNatsService

The input is basically where the service is (account, project, public),
and either what message to send or how to handle messages.
Also if the handler throws an error, the caller will throw
an error too.
*/

import {
  Svcm,
  type ServiceInfo,
  type ServiceStats,
  type ServiceIdentity,
} from "@nats-io/services";
import { type NatsEnv, type Location } from "@cocalc/nats/types";
import { trunc_middle } from "@cocalc/util/misc";
import { getEnv } from "@cocalc/nats/client";
import { randomId } from "@cocalc/nats/names";
import { delay } from "awaiting";
import { EventEmitter } from "events";
import { requestMany, respondMany } from "./many";
import { encodeBase64 } from "@cocalc/nats/util";

const DEFAULT_TIMEOUT = 5000;

export interface ServiceDescription extends Location {
  service: string;

  description?: string;

  // if true and multiple servers are setup in same "location", then they ALL get to respond (sender gets first response).
  all?: boolean;
}

export interface ServiceCall extends ServiceDescription {
  mesg: any;
  timeout?: number;
  env?: NatsEnv;

  // if true, call returns the raw response message, with no decoding or error wrapping.
  // (do not combine with many:true)
  raw?: boolean;

  // if true, uses requestMany so **responses can be arbitrarily large**.
  // This MUST be set for both client and server!  Don't use this unless
  // you need it, since every response involves 2 messages instead of 1
  // (the extra termination message).  A good example that uses this is
  // the jupyter api, since large output gets returned when you click on
  // "Fetch more output".
  many?: boolean;
}

export async function callNatsService(opts: ServiceCall): Promise<any> {
  // console.log("callNatsService", opts);
  const env = opts.env ?? (await getEnv());
  const { nc, jc } = env;
  const subject = serviceSubject(opts);
  let resp;
  const timeout = opts.timeout ?? DEFAULT_TIMEOUT;
  try {
    const data = jc.encode(opts.mesg);
    if (opts.many) {
      resp = await requestMany({ nc, subject, data, maxWait: timeout });
    } else {
      resp = await nc.request(subject, data, {
        timeout,
      });
    }
    if (opts.raw) {
      return resp;
    }
  } catch (err) {
    if (err.name == "NatsError") {
      const p = opts.path ? `${trunc_middle(opts.path, 64)}:` : "";
      if (err.code == "503") {
        err.message = `Not Available: service ${p}${opts.service} is not available`;
        throw err;
      } else if (err.code == "TIMEOUT") {
        throw Error(
          `Timeout: service ${p}${opts.service} did not respond for ${Math.round(timeout / 1000)} seconds`,
        );
      }
    }
    throw err;
  }
  const result = jc.decode(resp.data);
  if (result?.error) {
    throw Error(result.error);
  }
  return result;
}

export type CallNatsServiceFunction = typeof callNatsService;

export interface Options extends ServiceDescription {
  env?: NatsEnv;
  description?: string;
  version?: string;
  handler: (mesg) => Promise<any>;
  // see corresponding call option above.
  many?: boolean;
}

export async function createNatsService(options: Options) {
  const s = new NatsService(options);
  await s.init();
  return s;
}

export type CreateNatsServiceFunction = typeof createNatsService;

export function serviceSubject({
  service,

  account_id,
  browser_id,

  project_id,
  compute_server_id,

  path,
}: ServiceDescription): string {
  let segments;
  path = path ? encodeBase64(path) : "_";
  if (!project_id && !account_id) {
    segments = ["public", service];
  } else if (account_id) {
    segments = [
      "services",
      `account-${account_id}`,
      browser_id ?? "_",
      project_id ?? "_",
      path ?? "_",
      service,
    ];
  } else if (project_id) {
    segments = [
      "services",
      `project-${project_id}`,
      compute_server_id ?? "_",
      service,
      path,
    ];
  }
  return segments.join(".");
}

export function serviceName({
  service,

  account_id,
  browser_id,

  project_id,
  compute_server_id,
}: ServiceDescription): string {
  let segments;
  if (!project_id && !account_id) {
    segments = [service];
  } else if (account_id) {
    segments = [`account-${account_id}`, browser_id ?? "-", service];
  } else if (project_id) {
    segments = [`project-${project_id}`, compute_server_id ?? "-", service];
  }
  return segments.join("-");
}

export function serviceDescription({
  description,
  path,
}: ServiceDescription): string {
  return [description, path ? `\nPath: ${path}` : ""].join("");
}

export class NatsService extends EventEmitter {
  private options: Options;
  private subject: string;
  private api?;

  constructor(options: Options) {
    super();
    this.options = options;
    this.subject = serviceSubject(options);
  }

  init = () => {
    // do NOT await this.
    this.mainLoop();
  };

  private mainLoop = async () => {
    let d = 3000;
    let lastStart = 0;
    while (this.subject) {
      lastStart = Date.now();
      try {
        const env = this.options.env ?? (await getEnv());
        const svcm = new Svcm(env.nc);
        const service = await svcm.add({
          name: serviceName(this.options),
          version: this.options.version ?? "0.0.1",
          description: serviceDescription(this.options),
          queue: this.options.all ? randomId() : "0",
        });
        if (!this.subject) {
          return;
        }
        this.api = service.addEndpoint("api", { subject: this.subject });
        await this.listen();
      } catch (err) {
        if (!this.subject) {
          // closed
          return;
        }
        if (Date.now() - lastStart >= 30000) {
          // it ran for a while, so no delay
          d = 3000;
        } else {
          // it crashed quickly, so delay!
          d = Math.min(20000, d * 1.25 + Math.random());
          await delay(d);
        }
      }
    }
  };

  private listen = async () => {
    const env = this.options.env ?? (await getEnv());
    const jc = env.jc;
    for await (const mesg of this.api) {
      const request = jc.decode(mesg.data) ?? ({} as any);

      // console.log("handle nats service call", request);
      let resp;
      try {
        resp = await this.options.handler(request);
      } catch (err) {
        resp = { error: `${err}` };
      }
      try {
        const data = jc.encode(resp);
        if (this.options.many) {
          await respondMany({ mesg, nc: env.nc, data });
        } else {
          await mesg.respond(data);
        }
      } catch (err) {
        // If, e.g., resp is too big, then the error would be
        //    "NatsError: MAX_PAYLOAD_EXCEEDED"
        // and it is of course very important to make the caller aware that
        // there was an error, as opposed to just silently leaving
        // them hanging forever.
        const data = jc.encode({ error: `${err}` });
        if (this.options.many) {
          await respondMany({ mesg, nc: env.nc, data });
        } else {
          await mesg.respond(data);
        }
      }
    }
  };

  close = () => {
    if (!this.subject) {
      return;
    }
    this.emit("close");
    this.removeAllListeners();
    this.api?.stop();
    // @ts-ignore
    delete this.subject;
    // @ts-ignore
    delete this.options;
  };
}

interface ServiceClientOpts {
  options: ServiceDescription;
  maxWait?: number;
  id?: string;
}

export async function pingNatsService({
  options,
  maxWait = 500,
  id,
}: ServiceClientOpts): Promise<ServiceIdentity[]> {
  const env = await getEnv();
  const svc = new Svcm(env.nc);
  const m = svc.client({ maxWait, strategy: "stall" });
  const v: ServiceIdentity[] = [];
  for await (const ping of await m.ping(serviceName(options), id)) {
    v.push(ping);
  }
  return v;
}

export async function natsServiceInfo({
  options,
  maxWait = 500,
  id,
}: ServiceClientOpts): Promise<ServiceInfo[]> {
  const env = await getEnv();
  const svc = new Svcm(env.nc);
  const m = svc.client({ maxWait, strategy: "stall" });
  const v: ServiceInfo[] = [];
  for await (const info of await m.info(serviceName(options), id)) {
    v.push(info);
  }
  return v;
}

export async function natsServiceStats({
  options,
  maxWait = 500,
  id,
}: ServiceClientOpts): Promise<ServiceStats[]> {
  const env = await getEnv();
  const svc = new Svcm(env.nc);
  const m = svc.client({ maxWait, strategy: "stall" });
  const v: ServiceStats[] = [];
  for await (const stats of await m.stats(serviceName(options), id)) {
    v.push(stats);
  }
  return v;
}

export async function waitForNatsService({
  options,
  maxWait = 60000,
}: {
  options: ServiceDescription;
  maxWait?: number;
}) {
  let d = 100;
  let m = 100;
  const start = Date.now();
  const getPing = async (m: number) => {
    try {
      return await pingNatsService({ options, maxWait: m });
    } catch {
      // ping can fail, e.g, if not connected to nats at all or the ping
      // service isn't up yet.
      return [] as ServiceIdentity[];
    }
  };
  let ping = await getPing(m);
  while (ping.length == 0) {
    d = Math.min(10000, d * 1.3);
    m = Math.min(1500, m * 1.3);
    if (Date.now() - start + d >= maxWait) {
      console.log(`timeout waiting for ${serviceName(options)} to start...`, d);
      throw Error("timeout");
    }
    await delay(d);
    ping = await getPing(m);
  }
  return ping;
}
