import {
  callConatService,
  createConatService,
  serviceSubject,
  type ConatService,
} from "./service";
import type { Options, ServiceCall } from "./service";
import { until } from "@cocalc/util/async-utils";
import { conat } from "@cocalc/conat/client";
import { randomId } from "@cocalc/conat/names";
import { DataEncoding, decode, encode } from "../core/codec";
export type { ConatService };

type ServiceTransport = "fast-rpc" | "request";

interface TypedServiceCall extends Omit<ServiceCall, "mesg"> {
  mesg: { name: string; args: any[] };
  transport?: ServiceTransport;
}

type TypedServiceOptions = Omit<TypedServiceCall, "mesg">;

const FAST_RPC_PING = "__conat_ping";
const TYPED_SERVICE_ENCODING = DataEncoding.MsgPack;
const MAX_FAST_RPC_TYPED_SERVICE_BYTES = 4 * 1024 * 1024;

function serviceTransport(options: { transport?: ServiceTransport }) {
  return (
    options.transport ??
    (process.env.COCALC_CONAT_SERVICE_TRANSPORT == "request"
      ? "request"
      : "fast-rpc")
  );
}

async function callTypedConatService({
  transport,
  ...options
}: TypedServiceCall): Promise<any> {
  if (serviceTransport({ transport }) == "request") {
    return await callConatService(options);
  }
  const cn = options.client ?? (await conat());
  if (typeof cn.fastRpcRequest != "function") {
    return await callConatService(options);
  }
  const raw = encode({ encoding: TYPED_SERVICE_ENCODING, mesg: options.mesg });
  if (raw.length > MAX_FAST_RPC_TYPED_SERVICE_BYTES) {
    return await callConatService(options);
  }
  let response;
  try {
    response = await cn.fastRpcRequest(
      serviceSubject(options),
      { raw },
      { timeout: options.timeout },
    );
  } catch (err) {
    const message = `${err}`;
    if (
      (err as any)?.code == 413 ||
      message.includes("disconnected") ||
      message.includes("no services matching")
    ) {
      return await callConatService(options);
    }
    throw err;
  }
  if (
    response?.error &&
    (response.code == 413 || `${response.error}`.includes("too large"))
  ) {
    return await callConatService(options);
  }
  if (response?.raw == null) {
    throw Error("fast-rpc typed service response is missing raw payload");
  }
  return decode({ encoding: TYPED_SERVICE_ENCODING, data: response?.raw });
}

function requireFastRpcSizedRaw(mesg: any): Uint8Array {
  const raw = encode({ encoding: TYPED_SERVICE_ENCODING, mesg });
  if (raw.length > MAX_FAST_RPC_TYPED_SERVICE_BYTES) {
    const err = new Error(
      `typed service response too large for fast-rpc (${raw.length} bytes)`,
    );
    (err as any).code = 413;
    throw err;
  }
  return raw;
}

export interface Extra {
  ping: (opts?: { maxWait?: number }) => Promise<void>;
  waitFor: (opts?: { maxWait?: number }) => Promise<void>;
}

export interface ServiceApi {
  conat: Extra;
}

export function createServiceClient<Api>(options: TypedServiceOptions) {
  return new Proxy(
    {},
    {
      get: (_, prop) => {
        if (typeof prop !== "string") {
          return undefined;
        }
        if (prop == "conat") {
          return {
            ping: async (opts: { maxWait?: number } = {}) =>
              await pingTypedConatService({ options, ...opts }),
            waitFor: async (opts: { maxWait?: number } = {}) =>
              await waitForTypedConatService({ options, ...opts }),
          };
        }
        return async (...args) => {
          try {
            return await callTypedConatService({
              ...options,
              mesg: { name: prop, args },
            });
          } catch (err) {
            if (err instanceof Error) {
              err.message = `calling remote function '${prop}': ${err.message}`;
              throw err;
            }
            throw Error(`calling remote function '${prop}': ${err}`);
          }
        };
      },
    },
  ) as Api & ServiceApi;
}

export function createServiceHandler<Api>({
  impl,
  ...options
}: Omit<Options, "handler"> & {
  impl: Api;
  transport?: ServiceTransport;
}): ConatService {
  if (serviceTransport(options) == "request") {
    return createConatService({
      ...options,
      handler: async (mesg) => await impl[mesg.name](...mesg.args),
    });
  }
  const subject = serviceSubject(options);
  let closed = false;
  let handle: { close: () => void; stop: () => void } | undefined;
  void (async () => {
    const cn = options.client ?? (await conat());
    handle = await cn.fastRpcService(
      subject,
      async ({ raw }: { raw: Uint8Array }) => {
        const mesg = decode({ encoding: TYPED_SERVICE_ENCODING, data: raw });
        if (mesg?.name == FAST_RPC_PING) {
          return {
            raw: requireFastRpcSizedRaw("pong"),
          };
        }
        const name = mesg?.name;
        const args = mesg?.args ?? [];
        if (typeof name != "string" || typeof impl[name] != "function") {
          throw Error(`unknown service method '${String(name)}'`);
        }
        return {
          raw: requireFastRpcSizedRaw(await impl[name](...args)),
        };
      },
      { queue: options.all ? randomId() : "0" },
    );
    if (closed) {
      handle.close();
    }
  })();
  const legacyService = createConatService({
    ...options,
    handler: async (mesg) => await impl[mesg.name](...mesg.args),
  });

  return {
    subject,
    name: options.service,
    close: () => {
      closed = true;
      handle?.close();
      legacyService.close();
    },
    stop: () => {
      closed = true;
      handle?.stop();
      legacyService.close();
    },
  } as unknown as ConatService;
}

async function pingTypedConatService({
  options,
  maxWait = 3000,
}: {
  options: TypedServiceOptions;
  maxWait?: number;
}): Promise<string[]> {
  if (serviceTransport(options) == "request") {
    const pong = await callConatService({
      ...options,
      mesg: "ping",
      timeout: Math.max(3000, maxWait),
      noRetry: true,
    });
    return [pong];
  }
  const pong = await callTypedConatService({
    ...options,
    mesg: { name: FAST_RPC_PING, args: [] },
    timeout: Math.max(3000, maxWait),
  });
  return [pong];
}

async function waitForTypedConatService({
  options,
  maxWait = 60000,
}: {
  options: TypedServiceOptions;
  maxWait?: number;
}) {
  let ping: string[] = [];
  let pingMaxWait = 250;
  await until(
    async () => {
      pingMaxWait = Math.min(3000, pingMaxWait * 1.4);
      try {
        ping = await pingTypedConatService({ options, maxWait: pingMaxWait });
        return ping.length > 0;
      } catch {
        return false;
      }
    },
    {
      start: 1000,
      max: 10000,
      decay: 1.3,
      timeout: maxWait,
    },
  );
  return ping;
}
