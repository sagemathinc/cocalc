#!/usr/bin/env ts-node
import { setTimeout as delay } from "node:timers/promises";
import type {
  AcpChatContext,
  AcpStreamMessage,
} from "@cocalc/conat/ai/acp/types";
import type { Client as ConatClient } from "@cocalc/conat/core/client";
import { ChatStreamWriter } from "../index";
import * as queue from "../../sqlite/acp-queue";

// Mock ACP pieces that pull in ESM deps we don't need for this unit.
jest.mock("@cocalc/ai/acp", () => ({
  CodexAcpAgent: class {},
  EchoAgent: class {},
}));
jest.mock("@cocalc/conat/ai/acp/server", () => ({ init: async () => {} }));
jest.mock("@cocalc/backend/logger", () => ({
  __esModule: true,
  default: () => ({
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  }),
  getLogger: () => ({
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  }),
}));
jest.mock("../../sqlite/acp-queue", () => ({
  enqueueAcpPayload: jest.fn(),
  listAcpPayloads: jest.fn(() => []),
  clearAcpPayloads: jest.fn(),
}));

type RecordedSet = { generating?: boolean; content?: string };

function makeFakeSyncDB() {
  const sets: RecordedSet[] = [];
  let commits = 0;
  let saves = 0;
  let current: any;
  const syncdb: any = {
    metadata: baseMetadata,
    isReady: () => true,
    get_one: () => current,
    set: (val: any) => {
      sets.push(val);
      current = { ...(current ?? {}), ...val };
    },
    commit: () => {
      commits += 1;
    },
    save: async () => {
      saves += 1;
    },
    close: async () => {},
  };
  return {
    syncdb,
    sets,
    commits,
    saves,
    setCurrent: (val: any) => {
      current = val;
    },
  };
}

function makeFakeClient(): ConatClient {
  return {
    publish: async () => {},
  } as any;
}

const baseMetadata: AcpChatContext = {
  project_id: "p",
  path: "chat",
  message_date: "123",
  sender_id: "u",
} as any;

beforeEach(() => {
  (queue.listAcpPayloads as any)?.mockReset?.();
  (queue.listAcpPayloads as any)?.mockImplementation?.(() => []);
  (queue.enqueueAcpPayload as any)?.mockReset?.();
  (queue.clearAcpPayloads as any)?.mockReset?.();
});

async function flush(writer: ChatStreamWriter) {
  (writer as any).commit.flush();
  await delay(0);
}

describe("ChatStreamWriter", () => {
  it("clears generating on summary", async () => {
    const { syncdb, sets, setCurrent } = makeFakeSyncDB();
    setCurrent({
      get: (key: string) => (key === "generating" ? true : undefined),
    });
    const writer: any = new ChatStreamWriter({
      metadata: baseMetadata,
      client: makeFakeClient(),
      approverAccountId: "u",
      syncdbOverride: syncdb as any,
      logStoreFactory: () =>
        ({
          set: async () => {},
        }) as any,
    });

    await (writer as any).handle({
      type: "event",
      event: { type: "message", text: "hi" } as any,
      seq: 0,
    } as AcpStreamMessage);
    await flush(writer);

    await (writer as any).handle({
      type: "summary",
      finalResponse: "done",
      seq: 1,
    } as AcpStreamMessage);
    await flush(writer);

    const final = sets[sets.length - 1];
    expect(final.generating).toBe(false);
    (writer as any).dispose?.(true);
  });

  it("keeps usage but commits final state", async () => {
    const { syncdb, sets } = makeFakeSyncDB();
    const writer: any = new ChatStreamWriter({
      metadata: baseMetadata,
      client: makeFakeClient(),
      approverAccountId: "u",
      syncdbOverride: syncdb as any,
      logStoreFactory: () =>
        ({
          set: async () => {},
        }) as any,
    });

    await (writer as any).handle({
      type: "usage",
      usage: { tokens: 1 } as any,
      seq: 0,
    } as AcpStreamMessage);
    await (writer as any).handle({
      type: "summary",
      finalResponse: "done",
      seq: 1,
    } as AcpStreamMessage);
    await flush(writer);

    const final = sets[sets.length - 1];
    expect(final.generating).toBe(false);
    expect((writer as any).usage).toBeTruthy();
    (writer as any).dispose?.(true);
  });

  it("replays queued payloads without losing content", async () => {
    (queue.listAcpPayloads as any).mockReturnValue([
      {
        type: "event",
        event: { type: "message", text: "queued" },
        seq: 0,
      },
    ]);
    const { syncdb } = makeFakeSyncDB();
    const writer: any = new ChatStreamWriter({
      metadata: baseMetadata,
      client: makeFakeClient(),
      approverAccountId: "u",
      syncdbOverride: syncdb as any,
      logStoreFactory: () =>
        ({
          set: async () => {},
        }) as any,
    });
    await (writer as any).handle({
      type: "summary",
      seq: 1,
    } as AcpStreamMessage);
    await flush(writer);
    expect((queue.enqueueAcpPayload as any).mock.calls.length).toBe(1);
    (writer as any).dispose?.(true);
  });

  it("publishes logs and persists AKV", async () => {
    const publish = jest.fn().mockResolvedValue(undefined);
    const logSet = jest.fn().mockResolvedValue(undefined);
    const { syncdb } = makeFakeSyncDB();
    const writer: any = new ChatStreamWriter({
      metadata: baseMetadata,
      client: { publish } as any,
      approverAccountId: "u",
      syncdbOverride: syncdb as any,
      logStoreFactory: () =>
        ({
          set: logSet,
        }) as any,
    });
    const payload: AcpStreamMessage = {
      type: "event",
      event: { type: "message", text: "hi" } as any,
      seq: 0,
    };
    await (writer as any).handle(payload);
    (writer as any).persistLogProgress.flush();
    await (writer as any).handle({
      type: "summary",
      finalResponse: "done",
      seq: 1,
    } as AcpStreamMessage);
    await flush(writer);
    expect(publish).toHaveBeenCalled();
    expect(logSet).toHaveBeenCalled();
    (writer as any).dispose?.(true);
  });

  it("clears generating and queue on error", async () => {
    const { syncdb, sets, setCurrent } = makeFakeSyncDB();
    setCurrent({
      get: (key: string) => (key === "generating" ? true : undefined),
    });
    const writer: any = new ChatStreamWriter({
      metadata: baseMetadata,
      client: makeFakeClient(),
      approverAccountId: "u",
      syncdbOverride: syncdb as any,
      logStoreFactory: () =>
        ({
          set: async () => {},
        }) as any,
    });

    await (writer as any).handle({
      type: "event",
      event: { type: "message", text: "oops" } as any,
      seq: 0,
    } as AcpStreamMessage);
    await (writer as any).handle({
      type: "error",
      error: "failed",
      seq: 1,
    } as AcpStreamMessage);
    await flush(writer);

    const final = sets[sets.length - 1];
    expect(final.generating).toBe(false);
    expect((queue.clearAcpPayloads as any).mock.calls.length).toBe(1);
    (writer as any).dispose?.(true);
  });

  it("addLocalEvent writes an in-flight commit", async () => {
    const { syncdb, sets } = makeFakeSyncDB();
    const writer: any = new ChatStreamWriter({
      metadata: baseMetadata,
      client: makeFakeClient(),
      approverAccountId: "u",
      syncdbOverride: syncdb as any,
      logStoreFactory: () =>
        ({
          set: async () => {},
        }) as any,
    });
    (writer as any).addLocalEvent({
      type: "message",
      text: "local",
    });
    (writer as any).commit.flush();
    await delay(0);

    expect(sets.length).toBeGreaterThan(0);
    expect(sets[sets.length - 1].generating).toBe(true);
    (writer as any).dispose?.(true);
  });

  it("registers thread ids from summary", async () => {
    const { syncdb } = makeFakeSyncDB();
    const writer: any = new ChatStreamWriter({
      metadata: baseMetadata,
      client: makeFakeClient(),
      approverAccountId: "u",
      syncdbOverride: syncdb as any,
      logStoreFactory: () =>
        ({
          set: async () => {},
        }) as any,
    });

    await (writer as any).handle({
      type: "summary",
      finalResponse: "done",
      threadId: "thread-1",
      seq: 0,
    } as AcpStreamMessage);
    await flush(writer);

    expect((writer as any).getKnownThreadIds()).toContain("thread-1");
    (writer as any).dispose?.(true);
  });

  it("uses interrupted text when summary arrives", async () => {
    const { syncdb, sets } = makeFakeSyncDB();
    const writer: any = new ChatStreamWriter({
      metadata: baseMetadata,
      client: makeFakeClient(),
      approverAccountId: "u",
      syncdbOverride: syncdb as any,
      logStoreFactory: () =>
        ({
          set: async () => {},
        }) as any,
    });

    (writer as any).notifyInterrupted("Please fix X");
    await (writer as any).handle({
      type: "summary",
      finalResponse: "",
      seq: 0,
    } as AcpStreamMessage);
    await flush(writer);

    expect((writer as any).content).toContain("Please fix X");
    const final = sets[sets.length - 1];
    expect(final.generating).toBe(false);
    (writer as any).dispose?.(true);
  });

  it("concatenates multiple agent messages into final content", async () => {
    const { syncdb } = makeFakeSyncDB();
    const writer: any = new ChatStreamWriter({
      metadata: baseMetadata,
      client: makeFakeClient(),
      approverAccountId: "u",
      syncdbOverride: syncdb as any,
      logStoreFactory: () =>
        ({
          set: async () => {},
        }) as any,
    });

    await (writer as any).handle({
      type: "event",
      event: { type: "message", text: "first" } as any,
      seq: 0,
    } as AcpStreamMessage);
    await (writer as any).handle({
      type: "event",
      event: { type: "message", text: "second" } as any,
      seq: 1,
    } as AcpStreamMessage);
    await (writer as any).handle({
      type: "summary",
      finalResponse: "",
      seq: 2,
    } as AcpStreamMessage);
    await flush(writer);

    expect((writer as any).content).toContain("first");
    expect((writer as any).content).toContain("second");
    (writer as any).dispose?.(true);
  });

  it("aggregates multiple summary payloads", async () => {
    const { syncdb } = makeFakeSyncDB();
    const writer: any = new ChatStreamWriter({
      metadata: baseMetadata,
      client: makeFakeClient(),
      approverAccountId: "u",
      syncdbOverride: syncdb as any,
      logStoreFactory: () =>
        ({
          set: async () => {},
        }) as any,
    });

    await (writer as any).handle({
      type: "summary",
      finalResponse: "Hello",
      seq: 0,
    } as AcpStreamMessage);
    await (writer as any).handle({
      type: "summary",
      finalResponse: " world",
      seq: 1,
    } as AcpStreamMessage);
    await flush(writer);

    expect((writer as any).content).toContain("Hello");
    expect((writer as any).content).toContain("world");
    (writer as any).dispose?.(true);
  });
});
