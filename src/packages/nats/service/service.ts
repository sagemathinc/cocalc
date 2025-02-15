/*
Simple to use UI to connect anything in cocalc via request/reply services.

- callNatsService
- createNatsService

The input is basically where the service is (account, project, public),
and either what message to send or how to handle messages.
Also if the handler throws an error, the caller will throw
an error too.
*/

import { Svcm } from "@nats-io/services";
import { type NatsEnv } from "@cocalc/nats/types";
import { sha1, trunc_middle } from "@cocalc/util/misc";
import { getEnv } from "@cocalc/nats/client";

const DEFAULT_TIMEOUT = 5000;

export interface ServiceDescription {
  service: string;
  project_id?: string;
  account_id?: string;
  compute_server_id?: number;
  path?: string;
  description?: string;
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
  project_id,
  compute_server_id,
  path,
}: ServiceDescription): string {
  let segments;
  if (!project_id && !account_id) {
    segments = ["public", service];
  } else if (project_id) {
    segments = [
      "services",
      `project-${project_id}`,
      compute_server_id ?? "-",
      service,
      path ? sha1(path) : "-",
    ];
  } else if (account_id) {
    segments = ["services", `account-${account_id}`, service];
  }
  return segments.join(".");
}

export function serviceName({
  service,
  account_id,
  project_id,
  compute_server_id,
}: ServiceDescription): string {
  let segments;
  if (!project_id && !account_id) {
    segments = [service];
  } else if (project_id) {
    segments = [`project-${project_id}`, compute_server_id ?? "-", service];
  } else if (account_id) {
    segments = [`account-${account_id}`, service];
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

export class NatsService {
  private options: Options;
  private subject: string;
  private api?;

  constructor(options: Options) {
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
    this.api?.stop();
    // @ts-ignore
    delete this.subject;
    // @ts-ignore
    delete this.options;
  };
}
