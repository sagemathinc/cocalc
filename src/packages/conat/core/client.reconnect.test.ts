/*
DEVELOPMENT:

pnpm test ./client.reconnect.test.ts
*/

describe("core client subscription resync on reconnect", () => {
  it("does not unsubscribe subjects the client still wants during resync", async () => {
    jest.resetModules();

    const emitWithAck = jest
      .fn()
      .mockResolvedValueOnce(["wanted.subject"])
      .mockResolvedValueOnce([]);
    const socket = {
      on: jest.fn(),
      emit: jest.fn(),
      disconnect: jest.fn(),
      close: jest.fn(),
      timeout: jest.fn(() => ({ emitWithAck })),
      io: {
        on: jest.fn(),
        connect: jest.fn(),
        disconnect: jest.fn(),
      },
    };
    const connectToSocketIO = jest.fn(() => socket);

    jest.doMock("socket.io-client", () => ({
      connect: connectToSocketIO,
    }));

    const { Client } = require("./client");
    const client = new Client({
      address: "http://example.com",
      autoConnect: false,
      noCache: true,
    });
    const anyClient = client as any;
    anyClient.info = { user: { hub_id: "hub" } };
    anyClient.state = "connected";
    anyClient.queueGroups = { "wanted.subject": "0" };

    const stable = await anyClient.syncSubscriptions0(1000);

    expect(stable).toBe(true);
    expect(emitWithAck).toHaveBeenCalledTimes(1);
    expect(emitWithAck).toHaveBeenCalledWith("subscriptions", null);

    client.close();
  });

  it("unsubscribes only server-side extras during resync", async () => {
    jest.resetModules();

    const emitWithAck = jest
      .fn()
      .mockResolvedValueOnce(["wanted.subject", "stale.subject"])
      .mockResolvedValueOnce([]);
    const socket = {
      on: jest.fn(),
      emit: jest.fn(),
      disconnect: jest.fn(),
      close: jest.fn(),
      timeout: jest.fn(() => ({ emitWithAck })),
      io: {
        on: jest.fn(),
        connect: jest.fn(),
        disconnect: jest.fn(),
      },
    };
    const connectToSocketIO = jest.fn(() => socket);

    jest.doMock("socket.io-client", () => ({
      connect: connectToSocketIO,
    }));

    const { Client } = require("./client");
    const client = new Client({
      address: "http://example.com",
      autoConnect: false,
      noCache: true,
    });
    const anyClient = client as any;
    anyClient.info = { user: { hub_id: "hub" } };
    anyClient.state = "connected";
    anyClient.queueGroups = { "wanted.subject": "0" };

    const stable = await anyClient.syncSubscriptions0(1000);

    expect(stable).toBe(false);
    expect(emitWithAck).toHaveBeenNthCalledWith(1, "subscriptions", null);
    expect(emitWithAck).toHaveBeenNthCalledWith(2, "unsubscribe", [
      { subject: "stale.subject" },
    ]);

    client.close();
  });
});
