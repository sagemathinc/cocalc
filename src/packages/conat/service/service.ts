/*
Simple to use UI to connect anything in cocalc via request/reply services.

- callConatService
- createConatService

The input is basically where the service is (account, project, public),
and either what message to send or how to handle messages.
Also if the handler throws an error, the caller will throw
an error too.
*/

import { type Location } from "@cocalc/conat/types";
import { trunc_middle } from "@cocalc/util/misc";
import { getEnv, getLogger } from "@cocalc/conat/client";
import { randomId } from "@cocalc/conat/names";
import { delay } from "awaiting";
import { EventEmitter } from "events";
import { encodeBase64 } from "@cocalc/conat/util";
import { type Client } from "@cocalc/conat/core/client";

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

  // if it fails with error.code 503, we wait for service to be ready and try again,
  // unless this is set -- e.g., when waiting for the service in the first
  // place we set this to avoid an infinite loop.
  noRetry?: boolean;

  client?: Client;
}

export async function callConatService(opts: ServiceCall): Promise<any> {
  // console.log("callConatService", opts);
  const cn = opts.client ?? (await getEnv()).cn;
  const subject = serviceSubject(opts);
  let resp;
  const timeout = opts.timeout ?? DEFAULT_TIMEOUT;
  // ensure not undefined, since undefined can't be published.
  const data = opts.mesg ?? null;

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
    // console.log(`request to '${subject}' failed -- ${err}`);
    // it failed.
    if (opts.noRetry) {
      throw err;
    }
    // it's a nats problem
    const p = opts.path ? `${trunc_middle(opts.path, 64)}:` : "";
    if (err.code == 503) {
      // it's actually just not ready, so
      // wait for the service to be ready, then try again
      await waitForConatService({ options: opts, maxWait: timeout });
      try {
        return await doRequest();
      } catch (err) {
        if (err.code == 503) {
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
}

export type CallConatServiceFunction = typeof callConatService;

export interface Options extends ServiceDescription {
  description?: string;
  version?: string;
  handler: (mesg) => Promise<any>;
  client?: Client;
}

export function createConatService(options: Options) {
  return new ConatService(options);
}

export type CreateConatServiceFunction = typeof createConatService;

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

export class ConatService extends EventEmitter {
  private options: Options;
  public readonly subject: string;
  public readonly name: string;
  private sub?;

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
    this.log("starting service", {
      name: this.name,
      description: this.options.description,
      version: this.options.version,
    });
    const cn = this.options.client ?? (await getEnv()).cn;
    const queue = this.options.all ? randomId() : "0";
    this.sub = await cn.subscribe(this.subject, { queue });
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

export async function pingConatService({
  options,
  maxWait = 3000,
}: ServiceClientOpts): Promise<string[]> {
  const pong = await callConatService({
    ...options,
    mesg: "ping",
    timeout: Math.max(3000, maxWait),
    // set no-retry to avoid infinite loop
    noRetry: true,
  });
  return [pong];
}

export async function waitForConatService({
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
      return await pingConatService({ options, maxWait: m });
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
