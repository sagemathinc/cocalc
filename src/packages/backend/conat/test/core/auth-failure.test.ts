/*
Ensure authentication failures do not leave lingering websocket sessions.

pnpm test `pwd`/auth-failure.test.ts
*/

import getPort from "@cocalc/backend/get-port";
import { initConatServer } from "@cocalc/backend/conat/test/setup";
import { wait } from "@cocalc/backend/conat/test/util";
import { io as socketIoClient, type Socket } from "socket.io-client";
import { delay } from "awaiting";

jest.setTimeout(20_000);

describe("auth failure disconnect behavior", () => {
  let server;
  let socket: Socket | undefined;

  it("starts a server where auth always fails", async () => {
    const port = await getPort();
    server = await initConatServer({
      port,
      getUser: async () => {
        throw new Error("auth failed for test");
      },
    });
  });

  it("receives auth error info and then disconnects promptly", async () => {
    const u = new URL(server.address());
    const path = `${u.pathname.replace(/\/$/, "")}/conat` || "/conat";
    let sawConnect = false;
    let sawDisconnect = false;
    let info: any;
    socket = socketIoClient(u.origin, {
      path,
      transports: ["websocket"],
      reconnection: false,
      timeout: 2_000,
    });
    socket.on("connect", () => {
      sawConnect = true;
    });
    socket.on("disconnect", () => {
      sawDisconnect = true;
    });
    socket.on("info", (v) => {
      info = v;
    });

    await wait({
      timeout: 10_000,
      until: () => sawConnect || info != null,
    });
    await wait({
      timeout: 10_000,
      until: () => sawDisconnect,
    });
    let socketKeys: string[] = [];
    let statKeys: string[] = [];
    const start = Date.now();
    while (Date.now() - start < 10_000) {
      socketKeys = Object.keys((server as any).sockets ?? {});
      statKeys = Object.keys((server as any).stats ?? {});
      if (socketKeys.length === 0 && statKeys.length === 0) {
        break;
      }
      await delay(25);
    }
    expect(socketKeys).toEqual([]);
    expect(statKeys).toEqual([]);
    if (typeof info?.user?.error === "string") {
      expect(info.user.error).toContain("auth failed for test");
    }
  });

  it("clean up", async () => {
    socket?.close();
    await server?.close();
  });
});
