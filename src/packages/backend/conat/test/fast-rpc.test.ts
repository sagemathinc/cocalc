/*
Targeted tests for the fast-rpc typed-service backport (PR #8869).

DEVELOPMENT:

  pnpm test ./fast-rpc.test.ts
*/

import {
  createServiceClient,
  createServiceHandler,
} from "@cocalc/conat/service/typed";
import {
  before,
  after,
  connect,
  delay,
} from "@cocalc/backend/conat/test/setup";
import { wait } from "@cocalc/backend/conat/test/util";
import { ConatError } from "@cocalc/conat/core/client";

// Several tests below bounce sockets or wait for retries; jest's default
// 5s budget is too tight under CI parallelism.
jest.setTimeout(20_000);

beforeAll(before);

describe("fast-rpc service registration is best-effort", () => {
  // Implicit assertion: jest treats unhandled rejections during a test
  // as failures.  If createServiceHandler's IIFE didn't catch the
  // rejection from fastRpcService, this whole describe would fail.
  // The legacy service path must still work.
  let serverClient, callerClient, service;

  it("setup: stub serverClient.fastRpcService to fail", async () => {
    serverClient = connect();
    callerClient = connect();
    // Reject asynchronously (via real await) rather than returning an
    // already-rejected promise.  Node's unhandled-rejection detector is
    // sensitive to the precise microtask in which the rejection occurs;
    // a true async throw guarantees the IIFE's await handler is attached
    // before the rejection materializes, which is what production
    // failures look like (the actual fastRpcService rejects after a
    // network round-trip, not synchronously).
    (serverClient as any).fastRpcService = async () => {
      await new Promise((r) => setImmediate(r));
      throw new Error("simulated fast-rpc registration failure");
    };
  });

  it("createServiceHandler returns a usable service via the legacy path", async () => {
    interface Api {
      hello: (name: string) => Promise<string>;
    }
    service = createServiceHandler<Api>({
      client: serverClient,
      service: "fast-rpc-reg-fail",
      subject: "fast-rpc-reg-fail",
      impl: { hello: async (name) => `hi ${name}` },
    });
    expect(service).toBeDefined();
    expect(typeof service.close).toBe("function");

    // Give microtasks time for the IIFE to reject and the catch to run.
    await delay(50);

    const client = createServiceClient<Api>({
      client: callerClient,
      service: "fast-rpc-reg-fail",
      subject: "fast-rpc-reg-fail",
      timeout: 10_000,
    });
    await wait({
      until: async () => {
        try {
          return (await client.hello("conat")) === "hi conat";
        } catch {
          return false;
        }
      },
      timeout: 15_000,
    });
  });

  it("cleans up", () => {
    service.close();
    serverClient.close();
    callerClient.close();
  });
});

describe("fast-rpc caller fallback semantics", () => {
  // The fallback policy in callTypedConatService is delicate: we may
  // ONLY fall back to the legacy request path when we can prove the
  // request did not reach a service handler.  Otherwise auto-retry on
  // legacy can double-execute a side-effecting method.  Concretely:
  //   - transport-level ack timeout (router never acked) -> fall back
  //   - response-level 408 (server reached, inner emit timed out,
  //                          handler may have run) -> propagate
  //   - response-level 413 (handler returned an oversized result) -> propagate
  //   - "no services matching" / "disconnected" -> fall back
  let serverClient, callerClient, service;
  interface Api {
    square: (n: number) => Promise<number>;
  }
  let realFastRpcRequest: any;

  it("creates the service and verifies it works without any stub", async () => {
    serverClient = connect();
    callerClient = connect();

    service = createServiceHandler<Api>({
      client: serverClient,
      service: "fallback-policy",
      subject: "fallback-policy",
      impl: { square: async (n) => n * n },
    });

    // Bootstrap: confirm the service is fully reachable before we start
    // stubbing, so a slow handshake isn't misattributed below.
    const client = createServiceClient<Api>({
      client: callerClient,
      service: "fallback-policy",
      subject: "fallback-policy",
      timeout: 5_000,
    });
    await wait({
      until: async () => {
        try {
          return (await client.square(2)) === 4;
        } catch {
          return false;
        }
      },
      timeout: 15_000,
    });
  });

  it("transport-level ack timeout (transportTimeout flag) falls back to legacy", async () => {
    realFastRpcRequest = (callerClient as any).fastRpcRequest.bind(
      callerClient,
    );
    let fastRpcAttempts = 0;
    (callerClient as any).fastRpcRequest = async () => {
      fastRpcAttempts++;
      const e = new ConatError("timeout - operation has timed out", {
        code: 408,
      });
      // Simulates the real fastRpcRequest path: socket.io ack never
      // resolved (router has no fast-rpc handler at all) -> tagged so
      // the fallback is safe.
      (e as any).transportTimeout = true;
      throw e;
    };

    const client = createServiceClient<Api>({
      client: callerClient,
      service: "fallback-policy",
      subject: "fallback-policy",
      timeout: 5_000,
    });
    expect(await client.square(7)).toBe(49);
    expect(fastRpcAttempts).toBeGreaterThan(0);
    (callerClient as any).fastRpcRequest = realFastRpcRequest;
  });

  it("response-level 408 (no transportTimeout flag) propagates -- no double-execute", async () => {
    let fastRpcAttempts = 0;
    (callerClient as any).fastRpcRequest = async () => {
      fastRpcAttempts++;
      // No transportTimeout flag -- this is what the server-side inner
      // emit timeout looks like (server reached, handler may have run).
      throw new ConatError("Error: timeout waiting for fast-rpc-request ack", {
        code: 408,
      });
    };

    const client = createServiceClient<Api>({
      client: callerClient,
      service: "fallback-policy",
      subject: "fallback-policy",
      timeout: 5_000,
    });
    await expect(async () => {
      await client.square(7);
    }).rejects.toThrow(/timeout waiting for fast-rpc-request ack/);
    expect(fastRpcAttempts).toBe(1);
    (callerClient as any).fastRpcRequest = realFastRpcRequest;
  });

  it('"no services matching" message falls back to legacy', async () => {
    let fastRpcAttempts = 0;
    (callerClient as any).fastRpcRequest = async () => {
      fastRpcAttempts++;
      throw new ConatError(
        "fast-rpc -- no services matching 'fallback-policy'",
        { code: 503 },
      );
    };

    const client = createServiceClient<Api>({
      client: callerClient,
      service: "fallback-policy",
      subject: "fallback-policy",
      timeout: 5_000,
    });
    expect(await client.square(9)).toBe(81);
    expect(fastRpcAttempts).toBeGreaterThan(0);
    (callerClient as any).fastRpcRequest = realFastRpcRequest;
  });

  it("cleans up", () => {
    if (realFastRpcRequest) {
      (callerClient as any).fastRpcRequest = realFastRpcRequest;
    }
    service.close();
    serverClient.close();
    callerClient.close();
  });
});

describe("fast-rpc services re-register after a reconnect (syncRpcServices)", () => {
  // After the underlying socket is bounced, syncRpcServices must
  // re-register every locally-tracked fast-rpc service with the router.
  // We use the low-level fastRpcService/fastRpcRequest API directly so
  // the legacy request fallback can NOT mask a missing re-registration:
  // if syncRpcServices doesn't fire (or fails silently because of a
  // transient ack timeout), fastRpcRequest will return "no services
  // matching" and the test fails.
  let serverClient, callerClient, handle;

  it("registers a fast-rpc service and verifies it responds", async () => {
    serverClient = connect({ reconnectionDelay: 50 });
    callerClient = connect();

    handle = await serverClient.fastRpcService(
      "reconnect-re-register",
      async (payload: any) => ({ pong: payload?.ping }),
    );

    const resp = await callerClient.fastRpcRequest(
      "reconnect-re-register",
      { ping: 1 },
      { timeout: 5_000 },
    );
    expect(resp.pong).toBe(1);
  });

  it("bounces the server socket and the SAME fast-rpc subject responds again", async () => {
    serverClient.conn.io.engine.close();
    // Wait until fast-rpc routing is restored.  The only thing that can
    // re-register the service after the bounce is syncRpcServices on
    // the reconnect; if that path is broken (no retry loop, silent
    // unhandled rejection), fastRpcRequest stays in "no services
    // matching" / 408 forever.
    await wait({
      until: async () => {
        try {
          const resp = await callerClient.fastRpcRequest(
            "reconnect-re-register",
            { ping: 2 },
            { timeout: 1_000 },
          );
          return resp?.pong === 2;
        } catch {
          return false;
        }
      },
      timeout: 15_000,
    });
  });

  it("cleans up", () => {
    handle?.close();
    serverClient.close();
    callerClient.close();
  });
});

describe("close() removes fast-rpc routing", () => {
  // After service.close() the fast-rpc registration must be torn down
  // so subsequent calls fail (the legacy path is also closed).
  let serverClient, callerClient, service;
  interface Api {
    answer: () => Promise<number>;
  }

  it("creates and closes a service", async () => {
    serverClient = connect();
    callerClient = connect();
    service = createServiceHandler<Api>({
      client: serverClient,
      service: "close-removes-routing",
      subject: "close-removes-routing",
      impl: { answer: async () => 42 },
    });

    const client = createServiceClient<Api>({
      client: callerClient,
      service: "close-removes-routing",
      subject: "close-removes-routing",
      timeout: 5_000,
    });
    await wait({
      until: async () => {
        try {
          return (await client.answer()) === 42;
        } catch {
          return false;
        }
      },
      timeout: 10_000,
    });

    service.close();
  });

  it("call after close fails with a timeout", async () => {
    const client = createServiceClient<Api>({
      client: callerClient,
      service: "close-removes-routing",
      subject: "close-removes-routing",
      timeout: 500,
    });
    await expect(async () => {
      await client.answer();
    }).rejects.toThrow();
  });

  it("cleans up", () => {
    serverClient.close();
    callerClient.close();
  });
});

describe("oversized typed request/response handling", () => {
  // The fast-rpc transport caps payloads at 4 MiB.  Anything larger
  // on the request side can transparently fall back to the legacy
  // chunked path before any handler runs.  An oversized response is
  // different: the handler has already run, so retrying through legacy
  // could double-execute a side-effecting method.
  let serverClient, callerClient, service;
  let bigCalls = 0;
  interface Api {
    echoLen: (s: string) => Promise<number>;
    big: (n: number) => Promise<string>;
  }

  it("creates a service that accepts and returns large strings", async () => {
    serverClient = connect();
    callerClient = connect();
    service = createServiceHandler<Api>({
      client: serverClient,
      service: "oversized-fallback",
      subject: "oversized-fallback",
      impl: {
        echoLen: async (s) => s.length,
        big: async (n) => {
          bigCalls += 1;
          return "x".repeat(n);
        },
      },
    });
  });

  it("8 MiB request goes via legacy fallback (over the 4 MiB fast-rpc cap)", async () => {
    const client = createServiceClient<Api>({
      client: callerClient,
      service: "oversized-fallback",
      subject: "oversized-fallback",
      timeout: 30_000,
    });
    await wait({
      until: async () => {
        try {
          return (await client.echoLen("warmup")) === 6;
        } catch {
          return false;
        }
      },
      timeout: 15_000,
    });
    const n = 8 * 1024 * 1024;
    expect(await client.echoLen("x".repeat(n))).toBe(n);
  });

  it("8 MiB response propagates without legacy retry", async () => {
    const client = createServiceClient<Api>({
      client: callerClient,
      service: "oversized-fallback",
      subject: "oversized-fallback",
      timeout: 30_000,
    });
    const n = 8 * 1024 * 1024;
    await expect(async () => {
      await client.big(n);
    }).rejects.toThrow(/too large for fast-rpc/);
    expect(bigCalls).toBe(1);
  });

  it("known large-response methods can opt into legacy request transport", async () => {
    const client = createServiceClient<Api>({
      client: callerClient,
      requestTransportMethods: ["big"],
      service: "oversized-fallback",
      subject: "oversized-fallback",
      timeout: 30_000,
    });
    const n = 8 * 1024 * 1024;
    const before = bigCalls;
    expect((await client.big(n)).length).toBe(n);
    expect(bigCalls).toBe(before + 1);
  });

  it("cleans up", () => {
    service.close();
    serverClient.close();
    callerClient.close();
  });
});

describe("direct rpc and fast-rpc route ownership", () => {
  let serverClient, callerClient, rpcHandle, fastHandle;

  it("registers both direct transports on the same subject", async () => {
    serverClient = connect();
    callerClient = connect();
    rpcHandle = await serverClient.rpcService("dual-direct-rpc", {
      add: async (n: number) => n + 1,
    });
    fastHandle = await serverClient.fastRpcService(
      "dual-direct-rpc",
      async ({ n }: { n: number }) => ({ n: n + 1 }),
    );

    const rpc = callerClient.rpcCall("dual-direct-rpc", {
      timeout: 5_000,
    }) as { add: (n: number) => Promise<number> };
    expect(await rpc.add(2)).toBe(3);
    expect(
      await callerClient.fastRpcRequest(
        "dual-direct-rpc",
        { n: 4 },
        { timeout: 5_000 },
      ),
    ).toEqual(expect.objectContaining({ n: 5 }));
  });

  it("closing one direct transport keeps the other route registered", async () => {
    fastHandle.close();
    const rpc = callerClient.rpcCall("dual-direct-rpc", {
      timeout: 5_000,
    }) as { add: (n: number) => Promise<number> };
    await wait({
      until: async () => {
        try {
          return (await rpc.add(5)) === 6;
        } catch {
          return false;
        }
      },
      timeout: 5_000,
    });
  });

  it("closing the final direct transport removes the route", async () => {
    rpcHandle.close();
    const rpc = callerClient.rpcCall("dual-direct-rpc", { timeout: 500 }) as {
      add: (n: number) => Promise<number>;
    };
    await wait({
      until: async () => {
        try {
          await rpc.add(1);
          return false;
        } catch {
          return true;
        }
      },
      timeout: 5_000,
    });
  });

  it("cleans up", () => {
    serverClient.close();
    callerClient.close();
  });
});

describe("createServiceHandler return value preserves EventEmitter contract", () => {
  // Regression for an issue caught during local browser testing: the
  // pre-PR-8869 createServiceHandler returned a ConatService (extends
  // EventEmitter), and downstream code relied on `server.on(...)`.
  // The PR rewrote createServiceHandler to wrap the legacy service so
  // it could also register a fast-rpc handle -- the wrapper was a
  // plain object, which crashed callers like
  // packages/project/conat/terminal/manager.ts:172
  //
  //     const server = createTerminalServer(...);
  //     server.on("close", () => { ... });
  //         ^^ TypeError: server.on is not a function
  //
  // The terminal init retry loop in conat-terminal.ts then logged
  // "WARNING: starting terminal -- TypeError: server.on is not a
  // function (will retry)" forever, the browser-side terminal-browser
  // service never got registered, and the project's broadcast of new
  // terminal sizes back to the browser hit "no services matching" --
  // so the visual terminal stayed at the default 80-col width even
  // though the pty itself had been resized correctly.
  //
  // This test verifies that:
  //   (1) `.on()` is a function on the returned wrapper
  //   (2) listeners registered for the lifecycle events fire
  //
  // It does not test specific listener names that downstream code
  // happens to use (e.g. manager.ts uses "close", but the actual event
  // is "closed" -- a separate latent bug).  The contract this test
  // pins is "the returned object accepts and dispatches events",
  // which is what the regression actually broke.
  let serverClient, service;
  interface Api {
    ping: () => Promise<"pong">;
  }

  it("creates a typed-service handler", () => {
    serverClient = connect();
    service = createServiceHandler<Api>({
      client: serverClient,
      service: "ee-contract",
      subject: "ee-contract",
      impl: { ping: async () => "pong" as const },
    });
  });

  it("`.on` is a function (regression: previously was undefined, crashed callers)", () => {
    expect(typeof (service as any).on).toBe("function");
    expect(typeof (service as any).emit).toBe("function");
    expect(typeof (service as any).removeListener).toBe("function");
  });

  it("a listener registered for 'closed' fires when close() is called", async () => {
    let closedFired = 0;
    (service as any).on("closed", () => {
      closedFired += 1;
    });
    service.close();
    // emit happens synchronously inside legacyService.close(), but the
    // forwarder dispatches via wrapper.emit which is also sync.  A
    // single microtask of slack covers any future Promise wrapping.
    await delay(0);
    expect(closedFired).toBe(1);
  });

  it("cleans up", async () => {
    // Let the fast-rpc registration IIFE settle before closing the
    // client.  Without this, an in-flight subscription teardown can
    // race the client close and surface as a once()-rejection during
    // setState("closed").
    await delay(50);
    serverClient.close();
  });
});

afterAll(after);
