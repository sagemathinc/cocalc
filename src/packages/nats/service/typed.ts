import { callNatsService, createNatsService } from "./service";
import type { Options, ServiceCall } from "./service";

export function createServiceClient<Api>(options: Omit<ServiceCall, "mesg">) {
  return new Proxy(
    {},
    {
      get: (_, prop) => {
        if (typeof prop !== "string") {
          return undefined;
        }
        return async (...args) => {
          return await callNatsService({
            ...options,
            mesg: { name: prop, args },
          });
        };
      },
    },
  ) as Api;
}

export async function createServiceHandler<Api>({
  impl,
  ...options
}: Omit<Options, "handler"> & { impl: Api }) {
  return await createNatsService({
    ...options,
    handler: async (mesg) => await impl[mesg.name](...mesg.args),
  });
}
