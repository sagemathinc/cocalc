/** @jest-environment jsdom */

import type { LLMContext } from "../actions/llm";
import { processLLM } from "../actions/llm";

const mockQueryStream = jest.fn();
let emitter: any;

jest.mock("@cocalc/frontend/user-tracking", () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock("@cocalc/frontend/webapp-client", () => ({
  webapp_client: {
    openai_client: {
      queryStream: (...args: any[]) => {
        emitter = createEmitter();
        mockQueryStream(...args);
        return emitter;
      },
    },
    server_time: () => new Date(),
    conat_client: {},
  },
}));

jest.mock("../acp-api", () => ({
  processAcpLLM: jest.fn(),
}));

function createEmitter() {
  const handlers: Record<string, (...args: any[]) => void> = {};
  return {
    on(event: string, cb: (...args: any[]) => void) {
      handlers[event] = cb;
    },
    emit(event: string, ...args: any[]) {
      handlers[event]?.(...args);
    },
  };
}

function makeCtx(): {
  ctx: LLMContext;
  syncdb: any;
  sendReply: jest.Mock;
  setSpy: jest.Mock;
} {
  const set = jest.fn();
  const commit = jest.fn();
  const get_one = jest.fn().mockReturnValue({ generating: true });
  const syncdb = {
    set,
    commit,
    get_one,
    delete: jest.fn(),
    save: jest.fn(),
  };
  const sendReply = jest.fn(() => "2025-01-01T00:00:00.000Z");
  const ctx: LLMContext = {
    syncdb,
    store: {
      get: (key: string) =>
        key === "project_id" ? "proj" : key === "path" ? "chat.chat" : undefined,
    },
    chatStreams: new Set<string>(),
    getAllMessages: () => new Map(),
    sendReply,
    saveHistory: jest.fn((message) => ({
      date: "2025-01-01T00:00:00.000Z",
      prevHistory: message.history ?? [],
    })),
    getLLMHistory: jest.fn(() => []),
    getCodexConfig: jest.fn(),
    setCodexConfig: jest.fn(),
    computeThreadKey: jest.fn(() => "1700000000000"),
    project_id: "proj",
    path: "chat.chat",
  };
  return { ctx, syncdb, sendReply, setSpy: set };
}

function makeMessage() {
  const now = new Date("2025-02-02T00:00:00.000Z");
  return {
    event: "chat" as const,
    sender_id: "user-1",
    history: [
      {
        author_id: "00000000-1000-4000-8000-000000000001",
        content: "hello",
        date: now.toISOString(),
      },
    ],
    date: now,
  };
}

describe("processLLM streaming updates", () => {
  afterEach(() => {
    jest.clearAllMocks();
    emitter = undefined;
  });

  it("streams tokens into the same thinking message using ISO date", async () => {
    const { ctx, syncdb, sendReply } = makeCtx();
    const message = makeMessage();
    const reply_to = new Date("2025-02-02T01:00:00.000Z");

    await processLLM({
      ctx,
      message,
      reply_to,
      threadModel: "gpt-4",
    });

    expect(sendReply).toHaveBeenCalled();
    expect(emitter).toBeDefined();

    emitter.emit("token", "A");
    const lastSet = syncdb.set.mock.calls.pop()?.[0];
    expect(lastSet?.date).toBe("2025-01-01T00:00:00.000Z");
    expect(lastSet?.generating).toBe(true);
    expect(lastSet?.history?.[0]?.content).toBe("A");

    emitter.emit("token", null);
    expect(syncdb.commit).toHaveBeenCalled();
  });

  it("writes an error message and stops generating on stream error", async () => {
    const { ctx, syncdb } = makeCtx();
    const message = makeMessage();

    await processLLM({
      ctx,
      message,
      reply_to: new Date("2025-02-02T01:00:00.000Z"),
      threadModel: "gpt-4",
    });

    expect(emitter).toBeDefined();
    emitter.emit("error", "boom");

    const lastSet = syncdb.set.mock.calls.pop()?.[0];
    expect(lastSet?.generating).toBe(false);
    expect(String(lastSet?.history?.[0]?.content)).toContain("boom");
  });
});

describe("processLLM guards", () => {
  afterEach(() => {
    jest.clearAllMocks();
    emitter = undefined;
  });

  it("throttles when too many streams are active", async () => {
    const { ctx, syncdb } = makeCtx();
    for (let i = 0; i < 11; i++) ctx.chatStreams.add(`id-${i}`);
    const message = makeMessage();
    await processLLM({
      ctx,
      message,
      reply_to: new Date("2025-02-02T01:00:00.000Z"),
      threadModel: "gpt-4",
    });
    expect(mockQueryStream).not.toHaveBeenCalled();
    const lastSet = syncdb.set.mock.calls.pop()?.[0];
    expect(String(lastSet?.history?.[0]?.content)).toContain(
      "language model responses",
    );
    expect(lastSet?.generating).toBeUndefined();
  });

  it("halts streaming when generating is set false mid-stream", async () => {
    const { ctx, syncdb } = makeCtx();
    syncdb.get_one.mockImplementation(() => ({ generating: false }));
    const message = makeMessage();
    await processLLM({
      ctx,
      message,
      reply_to: new Date("2025-02-02T01:00:00.000Z"),
      threadModel: "gpt-4",
    });
    expect(emitter).toBeDefined();
    emitter?.emit("token", "A");
    expect(ctx.chatStreams.size).toBe(0);
  });
});

describe("processLLM model resolution and Codex dispatch", () => {
  afterEach(() => {
    jest.clearAllMocks();
    emitter = undefined;
  });

  it("falls back to thread model when no mention", async () => {
    const { ctx } = makeCtx();
    const message = makeMessage();
    message.history[0].content = "please do something";
    await processLLM({
      ctx,
      message,
      reply_to: new Date("2025-02-02T01:00:00.000Z"),
      threadModel: "gpt-4",
    });
    expect(mockQueryStream).toHaveBeenCalled();
    const args = mockQueryStream.mock.calls[0][0];
    expect(args.model).toBe("gpt-4");
  });

  it("routes codex models through processAcpLLM", async () => {
    const { ctx } = makeCtx();
    const message = makeMessage();
    message.history[0].content = "@codex do something";
    const { processAcpLLM } = require("../acp-api");
    await processLLM({
      ctx,
      message,
      reply_to: new Date("2025-02-02T01:00:00.000Z"),
      threadModel: "codex-agent",
    });
    expect(processAcpLLM).toHaveBeenCalled();
  });
});
