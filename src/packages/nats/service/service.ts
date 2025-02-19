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
import { sha1, trunc_middle } from "@cocalc/util/misc";
import { getEnv } from "@cocalc/nats/client";
import { randomId } from "@cocalc/nats/names";
import { delay } from "awaiting";
import { EventEmitter } from "events";

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
}

export async function callNatsService(opts: ServiceCall): Promise<any> {
  // console.log("callNatsService", opts);
  const env = opts.env ?? (await getEnv());
  const { nc, jc } = env;
  const subject = serviceSubject(opts);
  let resp;
  const timeout = opts.timeout ?? DEFAULT_TIMEOUT;
  try {
    resp = await nc.request(subject, jc.encode(opts.mesg), {
      timeout,
    });
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
  path = path ? sha1(path) : "_";
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

export interface Options extends ServiceDescription {
  env?: NatsEnv;
  description?: string;
  version?: string;
  handler: (mesg) => Promise<any>;
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

  init = async () => {
    const env = this.options.env ?? (await getEnv());
    const svcm = new Svcm(env.nc);

    const service = await svcm.add({
      name: serviceName(this.options),
      version: this.options.version ?? "0.0.1",
      description: serviceDescription(this.options),
      queue: this.options.all ? randomId() : "0",
    });

    this.api = service.addEndpoint("api", { subject: this.subject });
    this.listen();
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
      mesg.respond(jc.encode(resp));
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
  maxWait = 30000,
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
