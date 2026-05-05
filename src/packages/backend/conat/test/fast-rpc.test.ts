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
  //   - "no services matching" / "disconnected" / 413 -> fall back
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
    realFastRpcRequest = (callerClient as any).fastRpcRequest.bind(callerClient);
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
      throw new ConatError(
        "Error: timeout waiting for fast-rpc-request ack",
        { code: 408 },
      );
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

describe("oversized typed request falls back to legacy chunked path", () => {
  // The fast-rpc transport caps payloads at 4 MiB.  Anything larger
  // must transparently fall back to the legacy chunked path so callers
  // don't see spurious 413 errors.
  let serverClient, callerClient, service;
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
        big: async (n) => "x".repeat(n),
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

  it("8 MiB response goes via legacy fallback", async () => {
    const client = createServiceClient<Api>({
      client: callerClient,
      service: "oversized-fallback",
      subject: "oversized-fallback",
      timeout: 30_000,
    });
    const n = 8 * 1024 * 1024;
    const result = await client.big(n);
    expect(result.length).toBe(n);
  });

  it("cleans up", () => {
    service.close();
    serverClient.close();
    callerClient.close();
  });
});

afterAll(after);
