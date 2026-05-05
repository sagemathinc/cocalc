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

// Anthropic and OpenAI reject messages whose text content is empty.
// One bad turn (e.g. an empty assistant response stored in session
// history) would otherwise break every subsequent call. Substitute a
// short placeholder rather than dropping the entry, since the
// alternation logic below assumes one history slot per stored turn.
const EMPTY_CONTENT_PLACEHOLDER = "[empty]";

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
      const safe =
        typeof content === "string" && content.trim().length > 0
          ? content
          : EMPTY_CONTENT_PLACEHOLDER;
      tokens += numTokens(safe);
      messages.push({ role: nextRole, content: safe });
      nextRole = nextRole === "user" ? "assistant" : "user";
    }
  }

  return { messages, tokens };
}
