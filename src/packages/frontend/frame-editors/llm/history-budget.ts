/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Shared helpers for keeping agent conversation history inside a bounded
token budget before sending it to the LLM.

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

export const DEFAULT_AGENT_CONTEXT_TOKENS = 8000;
export const DEFAULT_AGENT_RESPONSE_TOKENS = 1000;
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

  const kept: AgentHistoryMessage[] = [];
  let totalTokens = baseTokens;

  for (let i = history.length - 1; i >= 0; i--) {
    const message = history[i];
    const nextTotal = totalTokens + estimateMessageTokens(message);
    if (kept.length === 0) {
      kept.unshift(message);
      totalTokens = nextTotal;
      continue;
    }
    if (nextTotal > maxInputTokens) break;
    kept.unshift(message);
    totalTokens = nextTotal;
  }

  return {
    history: kept,
    estimatedTokens: totalTokens,
    omittedMessages: Math.max(0, history.length - kept.length),
  };
}
