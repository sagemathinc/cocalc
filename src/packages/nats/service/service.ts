/*
Simple to use UI to connect anything in cocalc via request/reply services.

- callNatsService
- createNatsService

The input is basically where the service is (account, project, public),
and either what message to send or how to handle messages.
Also if the handler throws an error, the caller will throw
an error too.
*/

import { type Location } from "@cocalc/nats/types";
import { trunc_middle } from "@cocalc/util/misc";
import { getEnv, getLogger } from "@cocalc/nats/client";
import { randomId } from "@cocalc/nats/names";
import { delay } from "awaiting";
import { EventEmitter } from "events";
import { encodeBase64 } from "@cocalc/nats/util";

const DEFAULT_TIMEOUT = 10 * 1000;

const logger = getLogger("nats:service");

export interface ServiceDescription extends Location {
  service: string;

  description?: string;

  // if true and multiple servers are setup in same "location", then they ALL get to respond (sender gets first response).
  all?: boolean;

  // DEFAULT: ENABLE_SERVICE_FRAMEWORK
  enableServiceFramework?: boolean;

  subject?: string;
}

export interface ServiceCall extends ServiceDescription {
  mesg: any;
  timeout?: number;

  // if it fails with NatsError, we wait for service to be ready and try again,
  // unless this is set -- e.g., when waiting for the service in the first
  // place we set this to avoid an infinite loop.
  noRetry?: boolean;
}

export async function callNatsService(opts: ServiceCall): Promise<any> {
  // console.log("callNatsService", opts);
  const env = await getEnv();
  const { cn } = env;
  const subject = serviceSubject(opts);
  let resp;
  const timeout = opts.timeout ?? DEFAULT_TIMEOUT;
  const data = opts.mesg;

  const doRequest = async () => {
    resp = await cn.request(subject, data, {
      timeout,
    });
    const result = resp.data;
    if (result?.error) {
      throw Error(result.error);
    }
    return result;
  };

  // we just try to call the service first
  try {
    return await doRequest();
  } catch (err) {
    //console.log(`request to '${subject}' failed -- ${err}`);
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

  subject,
}: ServiceDescription): string {
  if (subject) {
    return subject;
  }
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
  private sub?;
  private name: string;

  constructor(options: Options) {
    super();
    this.options = options;
    this.name = serviceName(this.options);
    this.subject = serviceSubject(options);
    this.runService();
  }

  private log = (...args) => {
    logger.debug(`service:subject='${this.subject}' -- `, ...args);
  };

  // create and run the service until something goes wrong, when this
  // willl return. It does not throw an error.
  private runService = async () => {
    this.emit("starting");
    this.log("starting service", {name:this.name, 
                                  description:this.options.description, version:this.options.version});
    const { cn } = await getEnv();
    const queue = this.options.all ? randomId() : "0";
    this.sub = await cn.subscribe(this.subject, { queue, confirm:true });
    this.emit("running");
    await this.listen();
  };

  private listen = async () => {
    for await (const mesg of this.sub) {
      const request = mesg.data ?? {};

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
        await mesg.respond(resp);
      } catch (err) {
        // If, e.g., resp is too big, then the error would be
        //    "NatsError: MAX_PAYLOAD_EXCEEDED"
        // and it is of course very important to make the caller aware that
        // there was an error, as opposed to just silently leaving
        // them hanging forever.
        const data = { error: `${err}` };
        await mesg.respond(data);
      }
    }
  };

  close = () => {
    if (!this.subject) {
      return;
    }
    this.emit("close");
    this.removeAllListeners();
    this.sub?.stop();
    delete this.sub;
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
  maxWait = 3000,
}: ServiceClientOpts): Promise<string[]> {
  const pong = await callNatsService({
    ...options,
    mesg: "ping",
    timeout: Math.max(3000, maxWait),
    // set no-retry to avoid infinite loop
    noRetry: true,
  });
  return [pong];
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
      return await pingNatsService({ options, maxWait: m });
    } catch {
      // ping can fail, e.g, if not connected to nats at all or the ping
      // service isn't up yet.
      return [] as string[];
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
