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
import { sha1 } from "@cocalc/util/misc";

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
  if (opts.env == null) {
    throw Error("NATS env must be specified");
  }
  const { nc, jc } = opts.env;
  const subject = serviceSubject(opts);
  const resp = await nc.request(subject, jc.encode(opts.mesg), {
    timeout: opts.timeout,
  });
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

interface Options extends ServiceDescription {
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
    if (this.options.env == null) {
      throw Error("NATS env must be specified");
    }
    const svcm = new Svcm(this.options.env.nc);

    const service = await svcm.add({
      name: serviceName(this.options),
      version: this.options.version ?? "0.0.1",
      description: serviceDescription(this.options),
    });

    this.api = service.addEndpoint("api", { subject: this.subject });
    this.listen();
  };

  private listen = async () => {
    if (this.options.env == null) {
      throw Error("NATS env must be specified");
    }
    const jc = this.options.env.jc;
    for await (const mesg of this.api) {
      const request = jc.decode(mesg.data) ?? ({} as any);
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
