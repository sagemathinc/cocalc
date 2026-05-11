/*
DEVELOPMENT:

pnpm test ./client.reconnect.test.ts
*/

function mockSocketIO({ emitWithAck = jest.fn() } = {}) {
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

  return { socket, connectToSocketIO, emitWithAck };
}

describe("core client socket.io reconnect policy", () => {
  it("respects reconnection false passed by callers", async () => {
    jest.resetModules();

    const { connectToSocketIO } = mockSocketIO();

    const { connect } = require("./client");
    const client = connect({
      address: "http://example.com",
      reconnection: false,
    });

    expect(connectToSocketIO).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        reconnection: false,
      }),
    );

    client.close();
  });

  it("does not auto-connect when callers pass autoConnect false", async () => {
    jest.resetModules();

    const { connectToSocketIO, socket } = mockSocketIO();

    const { connect } = require("./client");
    const client = connect({
      address: "http://example.com",
      autoConnect: false,
      noCache: true,
    });

    expect(connectToSocketIO).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        autoConnect: false,
      }),
    );
    expect(socket.io.connect).not.toHaveBeenCalled();

    client.connect();
    expect(socket.io.connect).toHaveBeenCalledTimes(1);

    client.close();
  });
});

describe("core client subscription resync on reconnect", () => {
  it("does not unsubscribe subjects the client still wants during resync", async () => {
    jest.resetModules();

    const emitWithAck = jest
      .fn()
      .mockResolvedValueOnce(["wanted.subject"])
      .mockResolvedValueOnce([]);
    mockSocketIO({ emitWithAck });

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
    mockSocketIO({ emitWithAck });

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
