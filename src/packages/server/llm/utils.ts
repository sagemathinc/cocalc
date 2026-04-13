/**
 * Copyright (C) 2023-2026, Sagemath Inc.
 *
 * Shared utilities for the LLM evaluation layer.
 */

import getLogger from "@cocalc/backend/logger";
import type { ChatOutput } from "@cocalc/util/types/llm";
import { numTokens } from "./chatgpt-numtokens";

const log = getLogger("llm:utils");

/** AI SDK usage shape returned by generateText / streamText. */
export interface AIUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/**
 * Extract interesting token details from providerMetadata for logging.
 * Each provider stashes cache / reasoning token counts under its own key:
 *   - anthropic: cacheCreationInputTokens, cacheReadInputTokens
 *   - openai:    reasoningTokens, cachedPromptTokens
 *   - deepseek:  promptCacheHitTokens, promptCacheMissTokens
 *   - bedrock:   usage.cacheReadInputTokens, usage.cacheWriteInputTokens
 *   - google:    (not yet exposed by @ai-sdk/google — only groundingMetadata)
 */
export function extractTokenDetails(
  meta: Record<string, Record<string, unknown>> | undefined,
): Record<string, unknown> | undefined {
  if (!meta) return undefined;
  const details: Record<string, unknown> = {};

  // Anthropic prompt caching
  const anth = meta.anthropic;
  if (anth) {
    if (anth.cacheCreationInputTokens)
      details.cacheWriteTokens = anth.cacheCreationInputTokens;
    if (anth.cacheReadInputTokens)
      details.cacheReadTokens = anth.cacheReadInputTokens;
  }

  // OpenAI reasoning / caching
  const oai = meta.openai;
  if (oai) {
    if (oai.reasoningTokens) details.reasoningTokens = oai.reasoningTokens;
    if (oai.cachedPromptTokens)
      details.cachedPromptTokens = oai.cachedPromptTokens;
  }

  // DeepSeek caching
  const ds = meta.deepseek;
  if (ds) {
    if (ds.promptCacheHitTokens)
      details.cacheHitTokens = ds.promptCacheHitTokens;
    if (ds.promptCacheMissTokens)
      details.cacheMissTokens = ds.promptCacheMissTokens;
  }

  // Bedrock caching (nested under usage)
  const br = meta.bedrock as Record<string, unknown> | undefined;
  if (br) {
    const brUsage = br.usage as Record<string, unknown> | undefined;
    if (brUsage?.cacheReadInputTokens)
      details.cacheReadTokens = brUsage.cacheReadInputTokens;
    if (brUsage?.cacheWriteInputTokens)
      details.cacheWriteTokens = brUsage.cacheWriteInputTokens;
  }

  return Object.keys(details).length > 0 ? details : undefined;
}

/**
 * Build a ChatOutput from AI SDK usage, with fallback token estimation
 * and provider-metadata logging.
 */
export function buildChatOutput(
  output: string,
  usage: AIUsage,
  input: string,
  historyTokens: number,
  providerName: string,
  providerMetadata?: Record<string, Record<string, unknown>>,
): ChatOutput {
  // Use API-provided token counts; fall back to approximation only if the
  // provider returns 0 (e.g. some Ollama versions)
  const prompt_tokens =
    usage.promptTokens > 0
      ? usage.promptTokens
      : numTokens(input) + historyTokens;
  const completion_tokens =
    usage.completionTokens > 0 ? usage.completionTokens : numTokens(output);
  // Prefer the provider's total when it exceeds prompt+completion (e.g.
  // thinking/cached tokens that aren't split out).  Fall back to the sum.
  const computed = prompt_tokens + completion_tokens;
  const total_tokens =
    usage.totalTokens > computed ? usage.totalTokens : computed;

  const tokenDetails = extractTokenDetails(providerMetadata);

  log.debug(`${providerName} successful`, {
    prompt_tokens,
    completion_tokens,
    total_tokens,
    from_api: usage.promptTokens > 0,
    ...(tokenDetails ? { tokenDetails } : {}),
  });

  return { output, total_tokens, completion_tokens, prompt_tokens };
}
