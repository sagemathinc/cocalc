import { callNatsService, createNatsService } from "./service";
import type { NatsService as NatsService0, Options } from "./service";
import { getEnv } from "@cocalc/nats/client";

export function natsService<Message, Response>(
  options: Omit<Options, "handler">,
) {
  return new NatsService<Message, Response>(options);
}

export class NatsService<Message, Response> {
  private service?: NatsService0;
  private options: Omit<Options, "handler">;

  constructor(options: Omit<Options, "handler">) {
    this.options = options;
  }

  listen = async (handler: (mesg: Message) => Promise<Response>) => {
    this.service = await createNatsService({
      ...this.options,
      handler,
      env: await getEnv(),
    });
    return this.service;
  };

  close = () => {
    this.service?.close();
    delete this.service;
    // @ts-ignore
    delete this.options;
  };

  call = async (mesg: Message, timeout?: number): Promise<Response> => {
    const resp = await callNatsService({
      ...this.options,
      env: await getEnv(),
      timeout,
      mesg,
    });
    return resp as Response;
  };
}
