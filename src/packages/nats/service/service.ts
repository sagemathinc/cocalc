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
import { type Location } from "@cocalc/nats/types";
import { trunc_middle } from "@cocalc/util/misc";
import { getEnv, getLogger } from "@cocalc/nats/client";
import { randomId } from "@cocalc/nats/names";
import { delay } from "awaiting";
import { EventEmitter } from "events";
import { requestMany, respondMany } from "./many";
import { encodeBase64, waitUntilConnected } from "@cocalc/nats/util";

const DEFAULT_TIMEOUT = 10 * 1000;
const MONITOR_INTERVAL = 90 * 1000;

// switching this is awkward since it would have to be changed in projects
// and frontends or things would hang. I'm making it toggleable just for
// dev purposes so we can benchmark.
// Using the service framework gives us no real gain and cost a massive amount
// in terms of subscriptions -- basically there's a whole bunch for every file, etc.
// **In short: Do NOT enable this by default.**
const ENABLE_SERVICE_FRAMEWORK = false;

const logger = getLogger("nats:service");

export interface ServiceDescription extends Location {
  service: string;

  description?: string;

  // if true and multiple servers are setup in same "location", then they ALL get to respond (sender gets first response).
  all?: boolean;

  // DEFAULT: ENABLE_SERVICE_FRAMEWORK
  enableServiceFramework?: boolean;
}

export interface ServiceCall extends ServiceDescription {
  mesg: any;
  timeout?: number;

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

  // if it fails with NatsError, we wait for service to be ready and try again,
  // unless this is set -- e.g., when waiting for the service in the first
  // place we set this to avoid an infinite loop.
  noRetry?: boolean;
}

export async function callNatsService(opts: ServiceCall): Promise<any> {
  // console.log("callNatsService", opts);
  const env = await getEnv();
  const { nc, jc } = env;
  const subject = serviceSubject(opts);
  let resp;
  const timeout = opts.timeout ?? DEFAULT_TIMEOUT;
  const data = jc.encode(opts.mesg);

  const doRequest = async () => {
    await waitUntilConnected();
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
    const result = jc.decode(resp.data);
    if (result?.error) {
      throw Error(result.error);
    }
    return result;
  };

  // we just try to call the service
  try {
    return await doRequest();
  } catch (err) {
    // it failed.
    if (err.name == "NatsError" && !opts.noRetry) {
      // it's a nats problem
      const p = opts.path ? `${trunc_middle(opts.path, 64)}:` : "";
      if (err.code == "503") {
        // it's actually just not ready, so
        // wait for the service to be ready, then try again
        await waitForNatsService({ options: opts, maxWait: timeout });
        try {
          return await doRequest();
        } catch (err) {
          if (err.code == "503") {
            err.message = `Not Available: service ${p}${opts.service} is not available`;
          }
          throw err;
        }
      } else if (err.code == "TIMEOUT") {
        throw Error(
          `Timeout: service ${p}${opts.service} did not respond for ${Math.round(timeout / 1000)} seconds`,
        );
      }
    }
    throw err;
  }
}

export type CallNatsServiceFunction = typeof callNatsService;

export interface Options extends ServiceDescription {
  description?: string;
  version?: string;
  handler: (mesg) => Promise<any>;
  // see corresponding call option above.
  many?: boolean;
}

export function createNatsService(options: Options) {
  return new NatsService(options);
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
  private name: string;

  constructor(options: Options) {
    super();
    this.options = options;
    this.name = serviceName(this.options);
    this.subject = serviceSubject(options);
    this.startMonitor();
    this.startMainLoop();
  }

  private log = (...args) => {
    logger.debug(`service:'${this.name}' -- `, ...args);
  };

  private startMainLoop = async () => {
    while (this.subject) {
      await this.runService();
      await delay(5000);
    }
  };

  // The service monitor checks every MONITOR_INTERVAL when
  // connected that the service is definitely working and
  // responding to pings.  If not, it calls restartService.
  private startMonitor = async () => {
    while (this.subject) {
      this.log(`serviceMonitor: waiting ${MONITOR_INTERVAL}ms...`);
      await delay(MONITOR_INTERVAL);
      if (this.subject == null) return;
      await waitUntilConnected();
      if (this.subject == null) return;
      try {
        this.log(`serviceMonitor: ping`);
        await callNatsService({ ...this.options, mesg: "ping", timeout: 7500 });
        if (this.subject == null) return;
        this.log("serviceMonitor: ping SUCCESS");
      } catch (err) {
        if (this.subject == null) return;
        this.log(`serviceMonitor: ping FAILED -- ${err}`);
        this.restartService();
      }
    }
  };

  private restartService = () => {
    if (this.api) {
      this.api.stop();
      delete this.api;
    }
    this.runService();
  };

  // create and run the service until something goes wrong, when this
  // willl return. It does not throw an error.
  private runService = async () => {
    try {
      this.emit("starting");
      this.log("starting service");
      const env = await getEnv();
      if (this.options.enableServiceFramework ?? ENABLE_SERVICE_FRAMEWORK) {
        const svcm = new Svcm(env.nc);
        await waitUntilConnected();
        const service = await svcm.add({
          name: this.name,
          version: this.options.version ?? "0.0.1",
          description: serviceDescription(this.options),
          queue: this.options.all ? randomId() : "0",
        });
        if (!this.subject) {
          return;
        }
        this.api = service.addEndpoint("api", { subject: this.subject });
      } else {
        this.api = env.nc.subscribe(this.subject);
      }
      this.emit("running");
      await this.listen();
    } catch (err) {
      this.log(`service stopping due to ${err}`);
    }
  };

  private listen = async () => {
    const env = await getEnv();
    const jc = env.jc;
    for await (const mesg of this.api) {
      const request = jc.decode(mesg.data) ?? ({} as any);

      // console.logger.debug("handle nats service call", request);
      let resp;
      if (request == "ping") {
        resp = "pong";
      } else {
        try {
          resp = await this.options.handler(request);
        } catch (err) {
          resp = { error: `${err}` };
        }
      }
      try {
        const data = jc.encode(resp);
        if (this.options.many) {
          await respondMany({ mesg, data });
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
          await respondMany({ mesg, data });
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
    delete this.api;
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
}: ServiceClientOpts): Promise<(ServiceIdentity | string)[]> {
  if (!(options.enableServiceFramework ?? ENABLE_SERVICE_FRAMEWORK)) {
//     console.log(
//       `pingNatsService: ${options.service}.${options.description ?? ""} -- using fallback ping`,
//     );
    const pong = await callNatsService({
      ...options,
      mesg: "ping",
      timeout: Math.max(3000, maxWait),
      // set no-retry to avoid infinite loop
      noRetry: true,
    });
//     console.log(
//       `pingNatsService: ${options.service}.${options.description ?? ""} -- success`,
//     );
    return [pong];
  }
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
  if (!(options.enableServiceFramework ?? ENABLE_SERVICE_FRAMEWORK)) {
    throw Error(`service framework not enabled for ${options.service}`);
  }
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
  if (!(options.enableServiceFramework ?? ENABLE_SERVICE_FRAMEWORK)) {
    throw Error(`service framework not enabled for ${options.service}`);
  }
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
  let d = 1000;
  let m = 100;
  const start = Date.now();
  const getPing = async (m: number) => {
    try {
      await waitUntilConnected();
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
      logger.debug(
        `timeout waiting for ${serviceName(options)} to start...`,
        d,
      );
      throw Error("timeout");
    }
    await delay(d);
    ping = await getPing(m);
  }
  return ping;
}
