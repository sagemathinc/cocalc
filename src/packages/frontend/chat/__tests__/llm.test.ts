/** @jest-environment jsdom */

import type { LLMContext } from "../actions/llm";
import { processLLM } from "../actions/llm";

// Mocks
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
  return { ctx, syncdb, sendReply };
}

function makeMessage() {
  const now = new Date("2025-02-02T00:00:00.000Z");
  return {
    event: "chat" as const,
    sender_id: "user-1",
    history: [
      { author_id: "user-1", content: "hello", date: now.toISOString() },
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
    const reply_to = new Date("2025-02-02T01:00:00.000Z");

    await processLLM({
      ctx,
      message,
      reply_to,
      threadModel: "gpt-4",
    });

    expect(emitter).toBeDefined();
    emitter.emit("error", "boom");

    const lastSet = syncdb.set.mock.calls.pop()?.[0];
    expect(lastSet?.generating).toBe(false);
    expect(String(lastSet?.history?.[0]?.content)).toContain("boom");
  });
});
