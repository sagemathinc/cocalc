/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Shared helpers for keeping agent conversation history inside a bounded
token budget before sending it to the LLM.

Strategy: keep a stable prefix (first exchange) + recent tail, drop the
middle.  This is optimised for Anthropic prompt caching — a stable prefix
means the KV cache is reused across turns (90 % cheaper input tokens,
much lower TTFT).  The most recent messages are always kept so the model
sees the latest context.

Each agent variant is still responsible for:
- deciding which prior messages matter
- compacting each message into a short model-facing form
- building its own system prompt/context

This module only answers: given a compacted history plus the current
system prompt and user input, how much prior history can we still afford?
*/

import { numTokensEstimate } from "@cocalc/frontend/misc/llm";
import { getUserDefinedLLMByModel } from "@cocalc/frontend/frame-editors/llm/use-userdefined-llm";
import {
  getMaxTokens,
  isUserDefinedModel,
  type LanguageModel,
} from "@cocalc/util/db-schema/llm-utils";

export type AgentHistoryMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export const DEFAULT_AGENT_CONTEXT_TOKENS = 50_000;
export const DEFAULT_AGENT_RESPONSE_TOKENS = 4000;
export const DEFAULT_AGENT_INPUT_TOKENS =
  DEFAULT_AGENT_CONTEXT_TOKENS - DEFAULT_AGENT_RESPONSE_TOKENS;
const MESSAGE_OVERHEAD_TOKENS = 8;
const SYSTEM_AND_INPUT_OVERHEAD_TOKENS = 24;

export function getAgentInputTokenBudget(
  model?: LanguageModel | string,
  reservedResponseTokens: number = DEFAULT_AGENT_RESPONSE_TOKENS,
): number {
  const userConfig =
    typeof model === "string" && isUserDefinedModel(model)
      ? getUserDefinedLLMByModel(model)
      : null;
  return Math.max(
    1000,
    getMaxTokens(model as LanguageModel | undefined, userConfig ?? undefined) -
      reservedResponseTokens,
  );
}

function estimateMessageTokens({
  content,
}: Pick<AgentHistoryMessage, "content">): number {
  return numTokensEstimate(content) + MESSAGE_OVERHEAD_TOKENS;
}

export function estimateConversationTokens({
  system,
  input,
  history,
}: {
  system: string;
  input: string;
  history: AgentHistoryMessage[];
}): number {
  let total =
    numTokensEstimate(system) +
    numTokensEstimate(input) +
    SYSTEM_AND_INPUT_OVERHEAD_TOKENS;
  for (const message of history) {
    total += estimateMessageTokens(message);
  }
  return total;
}

/**
 * Build a bounded conversation history that fits within a token budget.
 *
 * Uses a "keep prefix + keep tail, drop middle" strategy:
 *
 *  1. **Prefix** (always kept): the first user message + first assistant
 *     response.  This is typically the initial context (e.g. a
 *     "help-me-fix" payload with code) and few-shot examples.  Keeping it
 *     stable across turns lets Anthropic's prompt cache reuse the KV
 *     state for the entire prefix — cached input tokens are 90 % cheaper.
 *
 *  2. **Tail** (always kept): filled backward from the most recent
 *     message, preserving correct chronological order.  The model always
 *     sees the latest context.
 *
 *  3. **Middle** (dropped first): messages between prefix and tail are
 *     sacrificed when the budget is tight.
 *
 * The most recent message is always included even if the budget is
 * already exceeded by the prefix alone (the provider will handle
 * any overflow via its own context window).
 */
export function buildBoundedHistory({
  system,
  input,
  history,
  maxInputTokens = DEFAULT_AGENT_INPUT_TOKENS,
}: {
  system: string;
  input: string;
  history: AgentHistoryMessage[];
  maxInputTokens?: number;
}): {
  history: AgentHistoryMessage[];
  estimatedTokens: number;
  omittedMessages: number;
} {
  const baseTokens = estimateConversationTokens({
    system,
    input,
    history: [],
  });

  if (history.length === 0) {
    return {
      history: [],
      estimatedTokens: baseTokens,
      omittedMessages: 0,
    };
  }

  // Phase 1: Always keep the first exchange (first user msg + first
  // assistant response).  This is the stable prefix for prompt caching.
  const prefixCount = Math.min(2, history.length);
  const prefix = history.slice(0, prefixCount);
  let totalTokens = baseTokens;
  for (const msg of prefix) {
    totalTokens += estimateMessageTokens(msg);
  }

  // If that's all the history, return it.
  if (history.length <= prefixCount) {
    return {
      history: prefix,
      estimatedTokens: totalTokens,
      omittedMessages: 0,
    };
  }

  // Phase 2: Fill from the end (most recent messages) backward.
  const tail: AgentHistoryMessage[] = [];
  for (let i = history.length - 1; i >= prefixCount; i--) {
    const msg = history[i];
    const msgTokens = estimateMessageTokens(msg);

    // Always include at least the most recent message.
    if (totalTokens + msgTokens > maxInputTokens && tail.length > 0) break;

    tail.unshift(msg);
    totalTokens += msgTokens;
  }

  const kept = [...prefix, ...tail];
  return {
    history: kept,
    estimatedTokens: totalTokens,
    omittedMessages: history.length - kept.length,
  };
}
