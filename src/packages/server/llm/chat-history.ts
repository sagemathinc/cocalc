/*
 * Copyright (C) 2023-2026, Sagemath Inc.
 * Convert CoCalc chat history to Vercel AI SDK message format.
 */

import type { History } from "@cocalc/util/types/llm";
import { numTokens } from "./chatgpt-numtokens";

export interface HistoryMessage {
  role: "user" | "assistant";
  content: string;
}

// Reconstruct the chat history from CoCalc's data.
// Assumes alternating user/assistant messages starting from user.
export function transformHistoryToMessages(history?: History): {
  messages: HistoryMessage[];
  tokens: number;
} {
  let tokens = 0;
  const messages: HistoryMessage[] = [];

  if (history) {
    let nextRole: "user" | "assistant" = "user";
    for (const { content } of history) {
      tokens += numTokens(content);
      messages.push({ role: nextRole, content });
      nextRole = nextRole === "user" ? "assistant" : "user";
    }
  }

  return { messages, tokens };
}
