import { callNatsService, createNatsService } from "./service";
import type { NatsService as NatsService0, Options } from "./service";
import { getEnv } from "@cocalc/nats/client";

export function natsService<Message, Response>(
  options: Omit<Options, "handler">,
) {
  const S = new NatsService<Message, Response>(options);
  return S as CallableNatsServiceInstance<Message, Response>;
}

interface CallableNatsService<Message, Response> {
  (mesg: Message, timeout?: number): Promise<Response>;
}

export type CallableNatsServiceInstance<Message, Response> = NatsService<
  Message,
  Response
> &
  CallableNatsService<Message, Response>;

export class NatsService<Message, Response> {
  private service?: NatsService0;
  private options: Omit<Options, "handler">;

  constructor(options: Omit<Options, "handler">) {
    this.options = options;
    return new Proxy(this, {
      apply: (target, _thisArg, argumentsList) => {
        return target.call.apply(target, argumentsList);
      },
    });
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
