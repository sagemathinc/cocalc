import { addToHistory, buildChatMessage } from "..";

describe("chat helpers", () => {
  test("addToHistory prepends entries with timestamps", () => {
    const history = addToHistory([], {
      author_id: "user-1",
      content: "Hello",
    });
    expect(history).toHaveLength(1);
    expect(history[0].author_id).toBe("user-1");
    expect(history[0].content).toBe("Hello");
    expect(history[0].date).toMatch(/^20\d{2}-/);
  });

  test("buildChatMessage constructs message with metadata", () => {
    const msg = buildChatMessage({
      sender_id: "agent",
      date: new Date("2024-01-01T00:00:00Z"),
      prevHistory: [],
      content: "Response",
      generating: false,
      acp_thread_id: "thread-123",
    });
    expect(msg.sender_id).toBe("agent");
    expect(msg.history[0].content).toBe("Response");
    expect(msg.acp_thread_id).toBe("thread-123");
    expect(msg.generating).toBe(false);
  });
});
