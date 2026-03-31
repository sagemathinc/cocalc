/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import {
  buildBoundedHistory,
  estimateConversationTokens,
  getAgentInputTokenBudget,
  type AgentHistoryMessage,
} from "./history-budget";

describe("history-budget", () => {
  const system = "System prompt";
  const input = "Current user input";

  const history: AgentHistoryMessage[] = [
    {
      role: "user",
      content: "old ".repeat(200),
    },
    {
      role: "assistant",
      content: "middle ".repeat(120),
    },
    {
      role: "user",
      content: "recent ".repeat(80),
    },
  ];

  test("keeps the newest messages that fit the budget", () => {
    const latestOnlyTokens = estimateConversationTokens({
      system,
      input,
      history: history.slice(-1),
    });
    const latestTwoTokens = estimateConversationTokens({
      system,
      input,
      history: history.slice(-2),
    });

    const result = buildBoundedHistory({
      system,
      input,
      history,
      maxInputTokens:
        latestOnlyTokens + Math.floor((latestTwoTokens - latestOnlyTokens) / 2),
    });

    expect(result.history).toEqual(history.slice(-1));
    expect(result.omittedMessages).toBe(2);
  });

  test("keeps all history when the budget allows it", () => {
    const fullTokens = estimateConversationTokens({
      system,
      input,
      history,
    });

    const result = buildBoundedHistory({
      system,
      input,
      history,
      maxInputTokens: fullTokens + 50,
    });

    expect(result.history).toEqual(history);
    expect(result.omittedMessages).toBe(0);
  });

  test("keeps a contiguous recent tail instead of skipping back to older messages", () => {
    const nonContiguousHistory: AgentHistoryMessage[] = [
      { role: "user", content: "tiny ".repeat(10) },
      { role: "assistant", content: "large ".repeat(400) },
      { role: "user", content: "recent ".repeat(80) },
    ];
    const latestOnlyTokens = estimateConversationTokens({
      system,
      input,
      history: nonContiguousHistory.slice(-1),
    });
    const latestAndOldestTokens = estimateConversationTokens({
      system,
      input,
      history: [nonContiguousHistory[0], nonContiguousHistory[2]],
    });

    const result = buildBoundedHistory({
      system,
      input,
      history: nonContiguousHistory,
      maxInputTokens:
        latestOnlyTokens +
        Math.floor((latestAndOldestTokens - latestOnlyTokens) / 2),
    });

    expect(result.history).toEqual(nonContiguousHistory.slice(-1));
    expect(result.omittedMessages).toBe(2);
  });

  test("still keeps the most recent message when base prompt is already large", () => {
    const result = buildBoundedHistory({
      system: "system ".repeat(3000),
      input,
      history,
      maxInputTokens: 10,
    });

    expect(result.history).toEqual(history.slice(-1));
    expect(result.omittedMessages).toBe(2);
  });

  test("derives the input budget from the selected model limit", () => {
    expect(getAgentInputTokenBudget("gpt-5.4-mini-8k")).toBe(7192);
  });
});
