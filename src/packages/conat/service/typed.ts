import { EventEmitter } from "events";
import {
  callConatService,
  createConatService,
  serviceSubject,
  type ConatService,
} from "./service";
import type { Options, ServiceCall } from "./service";
import { until } from "@cocalc/util/async-utils";
import { conat, getLogger } from "@cocalc/conat/client";
import { randomId } from "@cocalc/conat/names";
import { DataEncoding, decode, encode } from "../core/codec";
export type { ConatService };

const logger = getLogger("conat:service:typed");

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
    const code = (err as any)?.code;
    const message = `${err}`;
    // Fall back to legacy request transport ONLY when we can prove the
    // request did not reach a service handler -- otherwise a retry on
    // legacy could double-execute a side-effecting method:
    //   413 ............... explicit oversize from server, never forwarded
    //   "no services matching" .. pure legacy responder, no fastRpcService
    //   "disconnected" .... target service socket disconnected pre-ack
    //   transportTimeout: true .. socket.io ack from the router itself
    //                              never came back (old router with no
    //                              fast-rpc handler, or pre-routing hang)
    // We do NOT auto-fall-back on a generic 408/timeout response from the
    // server: in that case the handler may have already run.
    if (
      code == 413 ||
      (err as any)?.transportTimeout === true ||
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
  // Fast-rpc registration is best-effort: the legacy service below stays
  // up even if it fails, so callers can still reach the service via the
  // legacy `request` transport (and `callTypedConatService` falls back
  // automatically on "no services matching" / 408 / 413).  Catch any
  // failure here so it doesn't surface as an unhandled rejection.
  void (async () => {
    try {
      const cn = options.client ?? (await conat());
      if (typeof cn.fastRpcService != "function") {
        // Older router/client without fast-rpc support -- legacy only.
        return;
      }
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
    } catch (err) {
      logger.debug(
        `fast-rpc service registration failed for '${subject}'; legacy transport will still serve requests: ${err}`,
      );
    }
  })();
  const legacyService = createConatService({
    ...options,
    handler: async (mesg) => await impl[mesg.name](...mesg.args),
  });

  // The pre-PR-8869 createServiceHandler returned `legacyService` (a
  // ConatService extends EventEmitter) directly, so callers wired up
  // listeners with `server.on(...)`.  The fast-rpc wrapper here is a
  // plain object, which would crash those callers with
  // "TypeError: server.on is not a function" -- regression observed in
  // packages/project/conat/terminal/manager.ts:172
  // (`server.on("close", ...)`).  Restore EventEmitter semantics by
  // returning an EventEmitter wrapper that forwards lifecycle events
  // emitted by the underlying legacyService ("starting", "running",
  // "closed").
  const wrapper = new EventEmitter();
  Object.assign(wrapper, {
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
  });
  for (const event of ["starting", "running", "closed"] as const) {
    legacyService.on(event, (...args: any[]) => wrapper.emit(event, ...args));
  }
  return wrapper as unknown as ConatService;
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
