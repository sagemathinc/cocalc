import {
  callConatService,
  createConatService,
  pingConatService,
  waitForConatService,
  type ConatService,
} from "./service";
import type { Options, ServiceCall } from "./service";
export type { ConatService };

export interface Extra {
  ping: (opts?: { maxWait?: number }) => Promise<void>;
  waitFor: (opts?: { maxWait?: number }) => Promise<void>;
}

export interface ServiceApi {
  conat: Extra;
}

export function createServiceClient<Api>(options: Omit<ServiceCall, "mesg">) {
  return new Proxy(
    {},
    {
      get: (_, prop) => {
        if (typeof prop !== "string") {
          return undefined;
        }
        if (prop == "conat") {
          return {
            ping: async (opts: { id?: string; maxWait?: number } = {}) =>
              await pingConatService({ options, ...opts }),
            waitFor: async (opts: { maxWait?: number } = {}) =>
              await waitForConatService({ options, ...opts }),
          };
        }
        return async (...args) => {
          try {
            return await callConatService({
              ...options,
              mesg: { name: prop, args },
            });
          } catch (err) {
            err.message = `calling remote function '${prop}': ${err.message}`;
            throw err;
          }
        };
      },
    },
  ) as Api & ServiceApi;
}

export function createServiceHandler<Api>({
  impl,
  ...options
}: Omit<Options, "handler"> & { impl: Api }): ConatService {
  return createConatService({
    ...options,
    handler: async (mesg) => await impl[mesg.name](...mesg.args),
  });
}
