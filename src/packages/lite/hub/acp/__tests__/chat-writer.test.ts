#!/usr/bin/env ts-node
import { describe, it, expect } from "@jest/globals";
import { setTimeout as delay } from "node:timers/promises";
import type {
  AcpChatContext,
  AcpStreamMessage,
} from "@cocalc/conat/ai/acp/types";
import type { Client as ConatClient } from "@cocalc/conat/core/client";
import { ChatStreamWriter } from "../index";

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
});
