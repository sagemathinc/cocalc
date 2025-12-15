// Mock the ACP SDK (ESM-only) so Jest can run under CJS transpilation.
jest.mock("@agentclientprotocol/sdk", () => {
  const mockConn = jest.fn(() => ({
    initialize: jest.fn(),
    newSession: jest.fn(),
    loadSession: jest.fn(),
    setSessionMode: jest.fn(),
    setSessionModel: jest.fn(),
  }));
  return {
    ClientSideConnection: mockConn,
    PROTOCOL_VERSION: 1,
    ndJsonStream: jest.fn(),
  };
});
jest.mock("@agentclientprotocol/sdk/dist/schema", () => ({}));

import path from "node:path";
import { CodexAcpAgent, CodexClientHandler } from "../codex";
import type { FileAdapter, TerminalAdapter } from "../adapters";
import { delay } from "awaiting";

const dummyFileAdapter: FileAdapter = {
  async readTextFile() {
    return "";
  },
  async writeTextFile() {
    return;
  },
};

const dummyTerminalAdapter: TerminalAdapter = {
  async start(_opts, _onOutput) {
    return {
      async kill() {
        return;
      },
      async waitForExit() {
        return {
          exitStatus: { exitCode: 0 },
          output: "",
          truncated: false,
        };
      },
    };
  },
};

function makeAgent() {
  const connection = {
    newSession: jest.fn(async ({ cwd }) => ({
      sessionId: "sess-1",
      models: {},
      modes: {},
      cwd,
    })),
    loadSession: jest.fn(async () => {
      throw new Error("not found");
    }),
    setSessionMode: jest.fn(async () => {}),
    setSessionModel: jest.fn(async () => {}),
  };
  const child: any = {
    kill: jest.fn(),
    once: jest.fn(),
    stderr: { setEncoding: jest.fn(), on: jest.fn() },
  };
  const handler: any = {};
  // @ts-expect-error – calling the private constructor in tests is fine.
  const agent = new CodexAcpAgent({ child, connection, handler });
  return { agent, connection };
}

describe("CodexAcpAgent sessions", () => {
  it("creates a session using the configured working directory and reuses it", async () => {
    const { agent, connection } = makeAgent();
    const cwd = "/tmp/workspace";
    const session1 = await (agent as any).ensureSession("k1", {
      workingDirectory: cwd,
    });
    expect(connection.newSession).toHaveBeenCalledTimes(1);
    expect(session1.cwd).toBe(path.resolve(cwd));

    const session2 = await (agent as any).ensureSession("k1", {
      workingDirectory: cwd,
    });
    expect(connection.newSession).toHaveBeenCalledTimes(1);
    expect(session2.sessionId).toBe(session1.sessionId);
  });

  it("creates a fresh session when the working directory changes", async () => {
    const { agent, connection } = makeAgent();
    await (agent as any).ensureSession("k1", {
      workingDirectory: "/tmp/one",
    });
    const session2 = await (agent as any).ensureSession("k1", {
      workingDirectory: "/tmp/two",
    });
    expect(connection.newSession).toHaveBeenCalledTimes(2);
    expect(session2.cwd).toBe(path.resolve("/tmp/two"));
  });

  it("applies mode and model changes when requested", async () => {
    const { agent, connection } = makeAgent();
    const session = await (agent as any).ensureSession("k1", {
      workingDirectory: "/tmp/one",
      model: "gpt-test",
      reasoning: "deep",
    });
    expect(connection.setSessionMode).toHaveBeenCalledWith({
      sessionId: session.sessionId,
      modeId: expect.any(String),
    });
    expect(connection.setSessionModel).toHaveBeenCalledWith({
      sessionId: session.sessionId,
      modelId: "gpt-test/deep",
    });
  });
});

describe("CodexClientHandler proxied terminals", () => {
  it("routes proxied commands through handlers with workspaceRoot defaults", async () => {
    const bashHandler = jest.fn(async ({ cwd }) => ({ output: `cwd:${cwd}` }));
    const handler = new CodexClientHandler({
      workspaceRoot: "/root/project",
      commandHandlers: new Map([["bash", bashHandler]]),
      fileAdapter: dummyFileAdapter,
      terminalAdapter: dummyTerminalAdapter,
    });

    const events: any[] = [];
    handler.setStream(async (msg) => {
      events.push(msg);
    });

    const { terminalId } = await handler.createTerminal({
      command: "bash",
      args: ["-lc", "pwd"],
      env: [],
      cwd: undefined,
      outputByteLimit: undefined,
    } as any);

    expect(terminalId).toBeTruthy();
    expect(bashHandler).toHaveBeenCalledTimes(1);
    const callArg = (bashHandler as jest.Mock).mock.calls[0]?.[0];
    expect(callArg?.cwd).toBe("/root/project");
    const start = events.find((e) => e.event?.phase === "start");
    expect(start?.event.cwd).toBe("/root/project");
    // wait to finish
    await delay(1);
    const exit = events.find((e) => e.event?.phase === "exit");
    expect(exit?.event.output).toContain("/root/project");
  });

  it("honors an explicit cwd when provided", async () => {
    const bashHandler = jest.fn(async ({ cwd }) => ({ output: `cwd:${cwd}` }));
    const handler = new CodexClientHandler({
      workspaceRoot: "/root/project",
      commandHandlers: new Map([["bash", bashHandler]]),
      fileAdapter: dummyFileAdapter,
      terminalAdapter: dummyTerminalAdapter,
    });

    const events: any[] = [];
    handler.setStream(async (msg) => {
      events.push(msg);
    });

    const explicitCwd = "/tmp/override";
    await handler.createTerminal({
      command: "bash",
      args: [],
      env: [],
      cwd: explicitCwd,
      outputByteLimit: undefined,
    } as any);

    expect(bashHandler).toHaveBeenCalledWith(
      expect.objectContaining({ cwd: explicitCwd }),
    );
    const start = events.find((e) => e.event?.phase === "start");
    expect(start?.event.cwd).toBe(explicitCwd);
  });
});
