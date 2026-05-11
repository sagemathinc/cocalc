/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { transformHistoryToMessages } from "./chat-history";

describe("transformHistoryToMessages", () => {
  test("alternates roles starting with user", () => {
    const { messages } = transformHistoryToMessages([
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
      { role: "user", content: "ok" },
    ]);
    expect(messages.map((m) => m.role)).toEqual([
      "user",
      "assistant",
      "user",
    ]);
  });

  // Empty/whitespace assistant turns get persisted in agent sessions when
  // a stream is cancelled or a provider returns no content. Anthropic's
  // API rejects empty text content blocks with a 400, so the next turn
  // would otherwise fail with "messages: text content blocks must be
  // non-empty". Substitute a non-empty placeholder.
  test("replaces empty content with a non-empty placeholder", () => {
    const { messages } = transformHistoryToMessages([
      { role: "user", content: "hi" },
      { role: "assistant", content: "" },
      { role: "user", content: "what?" },
    ]);
    expect(messages).toHaveLength(3);
    for (const m of messages) {
      expect(m.content.length).toBeGreaterThan(0);
    }
  });

  test("treats whitespace-only content as empty", () => {
    const { messages } = transformHistoryToMessages([
      { role: "user", content: "hi" },
      { role: "assistant", content: "   \n\t " },
    ]);
    expect(messages[1].content.trim().length).toBeGreaterThan(0);
  });

  test("preserves alternation when an entry is empty", () => {
    const { messages } = transformHistoryToMessages([
      { role: "user", content: "first" },
      { role: "assistant", content: "" },
      { role: "user", content: "third" },
      { role: "assistant", content: "fourth" },
    ]);
    expect(messages.map((m) => m.role)).toEqual([
      "user",
      "assistant",
      "user",
      "assistant",
    ]);
  });
});
