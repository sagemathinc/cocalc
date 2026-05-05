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

afterAll(after);
