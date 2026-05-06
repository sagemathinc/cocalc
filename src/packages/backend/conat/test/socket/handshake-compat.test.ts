/*
Mixed-version handshake compatibility tests for the dedicated
connect-control protocol introduced in PR #8869.

The protocol changed in commit 459f5656b2 from "client request /
server reply on inbox" to "client publishSync / server publish on
clientSubject".  Without compat shims, this would break two important
deployment scenarios:

  - old client (project / unrefreshed browser tab) -> new server (hub)
  - new client (refreshed browser tab) -> old server (project that has
    not restarted yet)

The shims live in:
  - server: socket/server.ts  -- also reply on inbox if isRequest()
  - client: socket/client.ts  -- also issue a parallel request alongside
                                  the publishSync, accept either reply

DEVELOPMENT:

  pnpm test ./handshake-compat.test.ts
*/

import {
  before,
  after,
  connect,
  delay,
} from "@cocalc/backend/conat/test/setup";
import { wait } from "@cocalc/backend/conat/test/util";
import { once } from "@cocalc/util/async-utils";
import {
  SOCKET_HEADER_CMD,
  SOCKET_HEADER_CONNECT_ATTEMPT,
} from "@cocalc/conat/socket/util";

jest.setTimeout(20_000);

beforeAll(before);

describe("server-side connect shim: legacy request/reply still works", () => {
  // A pre-PR-8869 client used cn.request(serverSubject, null,
  // {headers: {cmd: "connect", id}}) and read response.data ==
  // "connected".  After this PR the new server publishes via
  // clientSubject; the shim ALSO replies on the inbox so old clients
  // continue to work without restart.
  let cn1, cn2, server;
  const subject = "compat-old-client-new-server";

  it("creates a real new ConatSocketServer", async () => {
    cn1 = connect();
    cn2 = connect();
    server = cn1.socket.listen(subject);
    server.on("connection", (sock) => {
      sock.on("data", (d) => sock.write(`echo:${d}`));
    });
    // Wait until the server is ready to accept.
    await wait({
      until: () => (server as any).state == "ready",
      timeout: 5000,
    });
  });

  it("legacy request/reply with cmd:connect returns 'connected'", async () => {
    // Simulate an old client sending the legacy connect protocol
    // directly, bypassing ConatSocketClient.  The server must still
    // respond on the inbox.
    const fakeClientId = "legacy-test-client";
    const serverSubject = `${subject}.server.${(server as any).id}.${fakeClientId}`;
    const fakeClientSubject = `${subject}.client.${fakeClientId}`;
    // The new server's first-connect path awaits waitForInterest on
    // the clientSubject before completing.  A real legacy client would
    // already have subscribed -- emulate that.
    const sub = await cn2.subscribe(fakeClientSubject);
    try {
      const resp = await cn2.request(serverSubject, null, {
        headers: {
          [SOCKET_HEADER_CMD]: "connect",
          [SOCKET_HEADER_CONNECT_ATTEMPT]: 0,
          id: fakeClientId,
        },
        timeout: 5_000,
      });
      expect(resp.data).toBe("connected");
    } finally {
      sub.close();
    }
  });

  it("cleans up", () => {
    server.close();
    cn1.close();
    cn2.close();
  });
});

describe("client-side connect shim: works against legacy-emulating server", () => {
  // A pre-PR-8869 server only responded on the inbox; it did not
  // publish "connected" to clientSubject.  The new client publishes
  // AND issues a parallel request, so it can also connect to such a
  // legacy server.
  let cn1, cn2, statusSub, connectSub, client;
  const subject = "compat-new-client-old-server";
  const serverId = "legacy-server-id";

  it("sets up a legacy-only emulator (responds on inbox, never publishes to clientSubject)", async () => {
    cn1 = connect();
    cn2 = connect();

    // 1. Status subject -- the new client may query this for getServerId.
    //    We respond with our fake serverId.  (Also providing a loadBalancer
    //    below makes this redundant, but keeping it is closer to a real
    //    legacy server's behavior.)
    statusSub = await cn1.subscribe(`${subject}.server.status`);
    (async () => {
      for await (const mesg of statusSub) {
        mesg.respondSync({ id: serverId });
      }
    })();

    // 2. Connect command subject -- subscribe at the same pattern a real
    //    server would (`<subject>.server.<id>.*`).  Respond on the inbox
    //    only -- DO NOT publish to clientSubject.
    connectSub = await cn1.subscribe(`${subject}.server.${serverId}.*`);
    (async () => {
      for await (const mesg of connectSub) {
        const cmd = mesg.headers?.[SOCKET_HEADER_CMD];
        if (cmd == "connect" && mesg.isRequest()) {
          // Legacy behavior: ONLY reply on the inbox.  No clientSubject
          // publish.  If the new client only had the publishSync path
          // (no request), it would hang here.
          mesg.respond("connected", { noThrow: true });
        } else if (cmd == "ping") {
          mesg.respondSync(null);
        }
        // Other commands ignored -- this emulator only covers what the
        // handshake compat test needs.
      }
    })();
  });

  it("a real new ConatSocketClient transitions to 'ready' against the legacy emulator", async () => {
    client = cn2.socket.connect(subject, {
      loadBalancer: async () => serverId,
    });
    await wait({
      until: () => (client as any).state == "ready",
      timeout: 10_000,
    });
    expect((client as any).state).toBe("ready");
  });

  it("cleans up", () => {
    client?.close();
    statusSub?.close();
    connectSub?.close();
    cn1.close();
    cn2.close();
  });
});

describe("connect-attempt id deduplication: both shims firing together is safe", () => {
  // When both new-server (publishes on clientSubject) AND legacy-shim
  // (also replies on inbox) fire, the new client receives TWO
  // "connected" signals for the same attempt id.  connectAttempts is
  // cleared after the first; the second is dropped silently.  Verify
  // the client doesn't double-promote, doesn't crash, and stays in
  // "ready" state.
  let cn1, cn2, server, client;
  const subject = "compat-dedup";

  it("creates new server + new client (both shims active)", async () => {
    cn1 = connect();
    cn2 = connect();
    server = cn1.socket.listen(subject);
    server.on("connection", (sock) => {
      sock.on("data", (d) => sock.write(`ack:${d}`));
    });
    await wait({
      until: () => (server as any).state == "ready",
      timeout: 5000,
    });

    client = cn2.socket.connect(subject);
    await once(client, "ready");
    expect((client as any).state).toBe("ready");
  });

  it("end-to-end write/read still works", async () => {
    client.write("hello");
    const [data] = await once(client, "data");
    expect(data).toBe("ack:hello");
  });

  it("waits a moment for any duplicate connect replies and verifies state stays ready", async () => {
    await delay(100);
    expect((client as any).state).toBe("ready");
  });

  it("cleans up", () => {
    client.close();
    server.close();
    cn1.close();
    cn2.close();
  });
});

// ============================================================================
// Reconnect / mixed-version compatibility under churn.
//
// The static handshake tests above show that the shims interoperate at
// connect time.  The tests below exercise reconnect paths -- the actual
// production scenarios that motivated PR #8869's incremental rollout
// strategy: hub bounces, probe transient failures, mid-session
// disconnects.
// ============================================================================

describe("server upgrade preserves old-client connectivity", () => {
  // Real-world scenario: an old project (pre-PR-8869 code) is exchanging
  // messages with a hub.  The hub gets upgraded to a build with PR #8869
  // -- the new ConatSocketServer takes over the same subject with a
  // fresh server id.  The old project's reconnect logic re-fetches the
  // server id and re-issues the legacy request/reply connect command.
  // The server-side compat shim (server.ts cmd=="connect" branching on
  // mesg.isRequest()) must respond on the inbox so the old project
  // succeeds without restart.
  let cn1, cn2;
  const subject = "compat-server-upgrade";
  const fakeClientId = "legacy-roaming-client";
  const fakeClientSubject = `${subject}.client.${fakeClientId}`;
  let server: any;
  let sub;

  it("starts new server v1 and old-client emulator connects via legacy shim", async () => {
    cn1 = connect();
    cn2 = connect();
    server = cn1.socket.listen(subject);
    server.on("connection", (sock) => {
      sock.on("data", (d) => sock.write(`v1:${d}`));
    });
    await wait({
      until: () => (server as any).state == "ready",
      timeout: 5000,
    });

    sub = await cn2.subscribe(fakeClientSubject);
    const serverSubject = `${subject}.server.${(server as any).id}.${fakeClientId}`;
    const resp = await cn2.request(serverSubject, null, {
      headers: {
        [SOCKET_HEADER_CMD]: "connect",
        [SOCKET_HEADER_CONNECT_ATTEMPT]: 0,
        id: fakeClientId,
      },
      timeout: 5_000,
    });
    expect(resp.data).toBe("connected");
  });

  it("server v1 closes (simulating hub bounce mid-session)", async () => {
    server.close();
    // Brief settle so cluster sync clears the old listener's interest.
    await delay(50);
  });

  it("starts replacement server v2 (fresh id) and old-client emulator reconnects via legacy shim", async () => {
    server = cn1.socket.listen(subject);
    server.on("connection", (sock) => {
      sock.on("data", (d) => sock.write(`v2:${d}`));
    });
    await wait({
      until: () => (server as any).state == "ready",
      timeout: 5000,
    });

    // Old client uses the new server id (it would have re-fetched via
    // the status subject; emulating that lookup).
    const serverSubject = `${subject}.server.${(server as any).id}.${fakeClientId}`;
    const resp = await cn2.request(serverSubject, null, {
      headers: {
        [SOCKET_HEADER_CMD]: "connect",
        [SOCKET_HEADER_CONNECT_ATTEMPT]: 1,
        id: fakeClientId,
      },
      timeout: 5_000,
    });
    expect(resp.data).toBe("connected");
  });

  it("cleans up", () => {
    sub?.close();
    server?.close();
    cn1.close();
    cn2.close();
  });
});

describe("probe retry semantics: transient failure then success", () => {
  // The legacy probe path catches non-"connected" replies AND request
  // rejections (timeout etc.) and re-schedules itself with another
  // LEGACY_CONNECT_PROBE_DELAY (1.5s) wait.  Without that retry, a
  // single transient probe failure would wedge a new client against an
  // old server until the next reconnect cycle.  Verify the retry
  // actually works end-to-end.
  let cn1, cn2, statusSub, connectSub, client;
  const subject = "compat-probe-retry";
  const serverId = "legacy-retry-server";
  let probeRequestCount = 0;

  it("sets up legacy emulator that fails first probe with non-connected data, succeeds on second", async () => {
    cn1 = connect();
    cn2 = connect();

    statusSub = await cn1.subscribe(`${subject}.server.status`);
    (async () => {
      for await (const mesg of statusSub) {
        mesg.respondSync({ id: serverId });
      }
    })();

    connectSub = await cn1.subscribe(`${subject}.server.${serverId}.*`);
    (async () => {
      for await (const mesg of connectSub) {
        const cmd = mesg.headers?.[SOCKET_HEADER_CMD];
        if (cmd == "connect" && mesg.isRequest()) {
          probeRequestCount += 1;
          if (probeRequestCount == 1) {
            // First probe: respond with something that is NOT "connected"
            // -- forces the .then("non-connected") branch to reschedule.
            mesg.respond("not-yet", { noThrow: true });
          } else {
            mesg.respond("connected", { noThrow: true });
          }
        } else if (cmd == "ping") {
          mesg.respondSync(null);
        }
      }
    })();
  });

  it("new client reaches ready after the probe retries", async () => {
    client = cn2.socket.connect(subject, {
      loadBalancer: async () => serverId,
    });
    // Probe delay is 1.5s, so first probe at ~1.5s, second at ~3s.
    // 10s budget gives ample headroom for cluster scheduling jitter.
    await wait({
      until: () => (client as any).state == "ready",
      timeout: 10_000,
    });
    expect((client as any).state).toBe("ready");
    expect(probeRequestCount).toBeGreaterThanOrEqual(2);
  });

  it("cleans up", () => {
    client?.close();
    statusSub?.close();
    connectSub?.close();
    cn1.close();
    cn2.close();
  });
});

describe("probe cancellation on close() clears the deferred timer", () => {
  // If the user closes a connecting client before the legacy probe
  // fires, the setTimeout must be cleared.  Otherwise jest sees a leaked
  // open handle and -- worse -- the late-firing probe could publish
  // against a torn-down client.  close() invokes cancelLegacyConnectProbe
  // which both clears the timer and resets the scheduled flag.
  let cn1, cn2, statusSub, connectSub, client;
  const subject = "compat-probe-cancel";
  const serverId = "legacy-no-respond";
  let probeRequestCount = 0;

  it("sets up a legacy emulator that NEVER responds to connect requests", async () => {
    cn1 = connect();
    cn2 = connect();
    statusSub = await cn1.subscribe(`${subject}.server.status`);
    (async () => {
      for await (const mesg of statusSub) {
        mesg.respondSync({ id: serverId });
      }
    })();
    connectSub = await cn1.subscribe(`${subject}.server.${serverId}.*`);
    (async () => {
      for await (const mesg of connectSub) {
        const cmd = mesg.headers?.[SOCKET_HEADER_CMD];
        if (cmd == "connect" && mesg.isRequest()) {
          probeRequestCount += 1;
          // Intentionally do NOT respond -- request will time out client-side.
        }
      }
    })();
  });

  it("close() while probe timer is pending clears the timer cleanly", async () => {
    client = cn2.socket.connect(subject, {
      loadBalancer: async () => serverId,
    });
    // Wait long enough for sendConnectCommand to schedule the probe but
    // NOT long enough for the 1500ms timer to fire.
    await delay(200);
    expect((client as any).legacyConnectProbeScheduled).toBe(true);
    expect((client as any).legacyConnectProbeTimer).toBeDefined();

    client.close();
    expect((client as any).legacyConnectProbeScheduled).toBe(false);
    expect((client as any).legacyConnectProbeTimer).toBeUndefined();
  });

  it("waits past the original probe deadline and confirms no probe ever fired", async () => {
    // Probe was scheduled but cancelled.  Wait through the would-be
    // fire time plus margin; probeRequestCount must stay at 0.
    await delay(2_000);
    expect(probeRequestCount).toBe(0);
  });

  it("cleans up", () => {
    statusSub?.close();
    connectSub?.close();
    cn1.close();
    cn2.close();
  });
});

describe("reconnect re-arms the legacy probe with fresh attempt ids", () => {
  // After a successful connect via the legacy shim, force a disconnect
  // and verify (1) run() at the start of the new attempt clears any
  // stale probe state via cancelLegacyConnectProbe and connectAttempts,
  // (2) the next probe fires with a fresh, larger attempt id (no
  // collision with attempts from the first session), (3) the client
  // reaches ready again.  This protects the "transient network
  // wobble" path against an old server.
  let cn1, cn2, statusSub, connectSub, client;
  const subject = "compat-reconnect-rearm";
  const serverId = "legacy-rearm-server";
  let probeRequestAttempts: number[] = [];

  it("sets up legacy emulator that always responds 'connected'", async () => {
    cn1 = connect();
    cn2 = connect();
    statusSub = await cn1.subscribe(`${subject}.server.status`);
    (async () => {
      for await (const mesg of statusSub) {
        mesg.respondSync({ id: serverId });
      }
    })();
    connectSub = await cn1.subscribe(`${subject}.server.${serverId}.*`);
    (async () => {
      for await (const mesg of connectSub) {
        const cmd = mesg.headers?.[SOCKET_HEADER_CMD];
        if (cmd == "connect" && mesg.isRequest()) {
          const attempt = mesg.headers?.[SOCKET_HEADER_CONNECT_ATTEMPT];
          probeRequestAttempts.push(
            typeof attempt == "number" ? attempt : Number(attempt),
          );
          mesg.respond("connected", { noThrow: true });
        } else if (cmd == "ping") {
          mesg.respondSync(null);
        }
      }
    })();
  });

  it("first connect: client reaches ready via legacy probe", async () => {
    client = cn2.socket.connect(subject, {
      loadBalancer: async () => serverId,
    });
    await wait({
      until: () => (client as any).state == "ready",
      timeout: 10_000,
    });
    expect((client as any).state).toBe("ready");
    expect(probeRequestAttempts.length).toBeGreaterThanOrEqual(1);
  });

  it("force disconnect to simulate transport wobble; client schedules reconnect", async () => {
    const beforeAttempts = probeRequestAttempts.length;
    (client as any).disconnect();
    expect((client as any).state).toBe("disconnected");
    // The probe state must be cleared at the entry of the next run()
    // -- but it can also still be scheduled from the in-flight session.
    // The important guarantee is that no STALE attempt id leaks into
    // the next session's connectAttempts.
    void beforeAttempts;
  });

  it("client reconnects via the legacy probe with a fresh attempt id", async () => {
    const attemptsBeforeReconnect = probeRequestAttempts.slice();
    await wait({
      until: () => (client as any).state == "ready",
      timeout: 10_000,
    });
    expect((client as any).state).toBe("ready");

    // The reconnect must have fired at least one new probe whose
    // attempt id is strictly greater than every attempt id observed
    // during the first session.
    const maxBefore = attemptsBeforeReconnect.length
      ? Math.max(...attemptsBeforeReconnect)
      : -1;
    const newAttempts = probeRequestAttempts.slice(
      attemptsBeforeReconnect.length,
    );
    expect(newAttempts.length).toBeGreaterThanOrEqual(1);
    for (const a of newAttempts) {
      expect(a).toBeGreaterThan(maxBefore);
    }
  });

  it("cleans up", () => {
    client?.close();
    statusSub?.close();
    connectSub?.close();
    cn1.close();
    cn2.close();
  });
});

afterAll(after);
