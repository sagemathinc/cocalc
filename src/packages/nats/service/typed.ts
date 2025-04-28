import {
  callNatsService,
  createNatsService,
  natsServiceInfo,
  natsServiceStats,
  pingNatsService,
  waitForNatsService,
} from "./service";
import type { Options, ServiceCall } from "./service";

export interface Extra {
  info: typeof natsServiceInfo;
  stats: typeof natsServiceStats;
  ping: typeof pingNatsService;
  waitFor: (opts?: { maxWait?: number }) => Promise<void>;
}

export interface ServiceApi {
  nats: Extra;
}

export function createServiceClient<Api>(options: Omit<ServiceCall, "mesg">) {
  return new Proxy(
    {},
    {
      get: (_, prop) => {
        if (typeof prop !== "string") {
          return undefined;
        }
        if (prop == "nats") {
          return {
            info: async (opts: { id?: string; maxWait?: number } = {}) =>
              await natsServiceInfo({ options, ...opts }),
            stats: async (opts: { id?: string; maxWait?: number } = {}) =>
              await natsServiceStats({ options, ...opts }),
            ping: async (opts: { id?: string; maxWait?: number } = {}) =>
              await pingNatsService({ options, ...opts }),
            waitFor: async (opts: { maxWait?: number } = {}) =>
              await waitForNatsService({ options, ...opts }),
          };
        }
        return async (...args) => {
          try {
            return await callNatsService({
              ...options,
              mesg: { name: prop, args },
            });
          } catch (err) {
            err.message = `Error calling remote function '${prop}': ${err.message}`;
            throw err;
          }
        };
      },
    },
  ) as Api & ServiceApi;
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
