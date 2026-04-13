/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// Mock the self-referencing @cocalc/frontend imports for Jest.
// The { virtual: true } flag tells Jest to create the mock even if
// the module path can't be resolved (pnpm self-reference).
jest.mock(
  "@cocalc/frontend/misc/llm",
  () => ({
    numTokensEstimate: (s: string) => Math.ceil(s.length / 4),
  }),
  { virtual: true },
);

jest.mock(
  "@cocalc/frontend/frame-editors/llm/use-userdefined-llm",
  () => ({
    getUserDefinedLLMByModel: () => null,
  }),
  { virtual: true },
);

import {
  buildBoundedHistory,
  estimateConversationTokens,
  getAgentInputTokenBudget,
  type AgentHistoryMessage,
} from "./history-budget";

describe("history-budget", () => {
  const system = "System prompt";
  const input = "Current user input";

  // A conversation long enough to exercise the drop-middle strategy:
  //   [0] first user msg   (prefix)  ~50 tokens
  //   [1] first assistant   (prefix)  ~50 tokens
  //   [2] middle user                 ~200 tokens
  //   [3] middle assistant            ~200 tokens
  //   [4] recent user                 ~50 tokens
  const longHistory: AgentHistoryMessage[] = [
    { role: "user", content: "first ".repeat(50) },
    { role: "assistant", content: "response ".repeat(50) },
    { role: "user", content: "middle1 ".repeat(200) },
    { role: "assistant", content: "middle2 ".repeat(200) },
    { role: "user", content: "recent ".repeat(50) },
  ];

  test("keeps all history when the budget allows it", () => {
    const fullTokens = estimateConversationTokens({
      system,
      input,
      history: longHistory,
    });

    const result = buildBoundedHistory({
      system,
      input,
      history: longHistory,
      maxInputTokens: fullTokens + 50,
    });

    expect(result.history).toEqual(longHistory);
    expect(result.omittedMessages).toBe(0);
  });

  test("drops middle messages, keeps prefix and recent tail", () => {
    // Budget that fits prefix [0,1] + recent [4] but NOT the middle [2,3]
    const prefixAndRecentTokens = estimateConversationTokens({
      system,
      input,
      history: [longHistory[0], longHistory[1], longHistory[4]],
    });

    const result = buildBoundedHistory({
      system,
      input,
      history: longHistory,
      maxInputTokens: prefixAndRecentTokens + 10,
    });

    expect(result.history).toEqual([
      longHistory[0],
      longHistory[1],
      longHistory[4],
    ]);
    expect(result.omittedMessages).toBe(2);
  });

  test("keeps assistant in tail even when its user turn was dropped", () => {
    // Budget fits prefix [0,1] + [3,4] but not [2].
    // [3] is an assistant response whose triggering user turn [2] was
    // dropped.  We keep it: later messages may reference its content
    // ("apply your second suggestion"), and modern LLMs handle the
    // consecutive-assistant boundary between prefix and tail fine.
    const tokens = estimateConversationTokens({
      system,
      input,
      history: [longHistory[0], longHistory[1], longHistory[3], longHistory[4]],
    });

    const result = buildBoundedHistory({
      system,
      input,
      history: longHistory,
      maxInputTokens: tokens + 10,
    });

    expect(result.history).toEqual([
      longHistory[0],
      longHistory[1],
      longHistory[3],
      longHistory[4],
    ]);
    expect(result.omittedMessages).toBe(1);
  });

  test("preserves tool-call/result pairs in agent histories", () => {
    // Agent flow: assistant(tool_call) → user(tool_result) → assistant(answer)
    // When the budget drops the user prompt before the tool call, both
    // the tool call and result are kept — they form a coherent pair.
    const agentHistory: AgentHistoryMessage[] = [
      { role: "user", content: "first ".repeat(50) },
      { role: "assistant", content: "response ".repeat(50) },
      { role: "user", content: "help me fix ".repeat(200) }, // [2] dropped
      { role: "assistant", content: "read_file() ".repeat(30) }, // [3] kept
      { role: "user", content: "[Tool Result] file contents ".repeat(30) }, // [4] kept
      { role: "assistant", content: "here is the fix ".repeat(30) }, // [5] kept
    ];

    // Budget fits prefix [0,1] + [3,4,5] but not [2]
    const tokens = estimateConversationTokens({
      system,
      input,
      history: [
        agentHistory[0],
        agentHistory[1],
        agentHistory[3],
        agentHistory[4],
        agentHistory[5],
      ],
    });

    const result = buildBoundedHistory({
      system,
      input,
      history: agentHistory,
      maxInputTokens: tokens + 10,
    });

    expect(result.history).toEqual([
      agentHistory[0],
      agentHistory[1],
      agentHistory[3],
      agentHistory[4],
      agentHistory[5],
    ]);
    expect(result.omittedMessages).toBe(1);
  });

  test("keeps assistant as most recent message in tail", () => {
    // History ends with an assistant message. The most recent message
    // is always preserved regardless of role.
    const historyEndingWithAssistant: AgentHistoryMessage[] = [
      { role: "user", content: "first ".repeat(50) },
      { role: "assistant", content: "response ".repeat(50) },
      { role: "user", content: "middle ".repeat(200) },
      { role: "assistant", content: "latest ".repeat(50) },
    ];

    // Budget: prefix [0,1] + latest [3] but NOT [2]
    const tokens = estimateConversationTokens({
      system,
      input,
      history: [
        historyEndingWithAssistant[0],
        historyEndingWithAssistant[1],
        historyEndingWithAssistant[3],
      ],
    });

    const result = buildBoundedHistory({
      system,
      input,
      history: historyEndingWithAssistant,
      maxInputTokens: tokens + 10,
    });

    expect(result.history).toEqual([
      historyEndingWithAssistant[0],
      historyEndingWithAssistant[1],
      historyEndingWithAssistant[3],
    ]);
    expect(result.omittedMessages).toBe(1);
  });

  test("always keeps prefix + most recent even when budget is very tight", () => {
    const result = buildBoundedHistory({
      system: "system ".repeat(3000),
      input,
      history: longHistory,
      maxInputTokens: 10,
    });

    // Prefix (first 2) + most recent message always included
    expect(result.history).toEqual([
      longHistory[0],
      longHistory[1],
      longHistory[4],
    ]);
    expect(result.omittedMessages).toBe(2);
  });

  test("handles short history (≤ 2 messages) by keeping everything", () => {
    const short: AgentHistoryMessage[] = [
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi" },
    ];

    const result = buildBoundedHistory({
      system,
      input,
      history: short,
      maxInputTokens: 100,
    });

    expect(result.history).toEqual(short);
    expect(result.omittedMessages).toBe(0);
  });

  test("handles single-message history", () => {
    const single: AgentHistoryMessage[] = [{ role: "user", content: "hello" }];

    const result = buildBoundedHistory({
      system,
      input,
      history: single,
      maxInputTokens: 100,
    });

    expect(result.history).toEqual(single);
    expect(result.omittedMessages).toBe(0);
  });

  test("handles empty history", () => {
    const result = buildBoundedHistory({
      system,
      input,
      history: [],
      maxInputTokens: 100,
    });

    expect(result.history).toEqual([]);
    expect(result.omittedMessages).toBe(0);
  });

  test("derives the input budget from the selected model limit", () => {
    expect(getAgentInputTokenBudget("gpt-5.4-mini-8k")).toBe(46_000);
  });
});
