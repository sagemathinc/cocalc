import { CodexClientHandler } from "../codex-handler";
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
