/** @jest-environment jsdom */
jest.mock(
  "@cocalc/frontend/lite",
  () => ({
    lite: false,
    project_id: "",
    account_id: "",
    compute_server_id: 0,
  }),
  { virtual: true },
);

import { normalizeChatMessage, CURRENT_CHAT_MESSAGE_VERSION } from "../normalize";
import { handleSyncDBChange } from "../sync";

class MockStore {
  state: any = {};
  setState(update: any) {
    this.state = { ...this.state, ...update };
  }
  get(key: string) {
    return this.state[key];
  }
}

class MockSyncDB {
  constructor(private records: any[]) {}
  get_one(where: any) {
    return this.records.find((r) =>
      Object.entries(where).every(([k, v]) => r[k] === v),
    );
  }
}

describe("normalizeChatMessage", () => {
  it("converts date, builds history, and does not mutate input", () => {
    const raw = {
      event: "chat",
      sender_id: "user-1",
      date: "2024-01-02T03:04:05.000Z",
      payload: { content: "hello" },
    };
    const { message, upgraded } = normalizeChatMessage(raw);

    expect(upgraded).toBe(true);
    expect(message?.date instanceof Date).toBe(true);
    expect(message?.history?.length).toBe(1);
    expect(message?.history?.[0]?.content).toBe("hello");
    expect(message?.schema_version).toBe(CURRENT_CHAT_MESSAGE_VERSION);
    // original object should remain untouched
    expect(raw.payload?.content).toBe("hello");
  });
});

describe("handleSyncDBChange", () => {
  it("applies chat and draft changes into the store", () => {
    const date = new Date("2024-01-02T03:04:05.000Z");
    const messagesRecord = {
      event: "chat",
      sender_id: "user-1",
      date,
      history: [{ content: "hi", author_id: "user-1", date: date.toISOString() }],
      editing: {},
      folding: [],
      feedback: {},
      schema_version: CURRENT_CHAT_MESSAGE_VERSION,
    };
    const draftRecord = {
      event: "draft",
      sender_id: "user-1",
      date,
      input: "draft text",
      active: Date.now(),
    };
    const syncdb = new MockSyncDB([messagesRecord, draftRecord]);
    const store = new MockStore();

    // chat change
    handleSyncDBChange({
      syncdb,
      store,
      changes: [{ event: "chat", sender_id: "user-1", date }],
    });
    const storedMessage = store.state.messages?.get(`${date.valueOf()}`);
    expect(storedMessage?.get("history")?.first()?.get("content")).toBe("hi");

    // draft change
    handleSyncDBChange({
      syncdb,
      store,
      changes: [{ event: "draft", sender_id: "user-1", date }],
    });
    const draftKey = `${draftRecord.sender_id}:${draftRecord.date}`;
    expect(store.state.drafts?.get(draftKey)?.input).toBe("draft text");
  });
});
