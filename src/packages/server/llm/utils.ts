/**
 * Copyright (C) 2023-2026, Sagemath Inc.
 *
 * Shared utilities for the LLM evaluation layer.
 */

import getLogger from "@cocalc/backend/logger";
import type { ChatOutput } from "@cocalc/util/types/llm";
import { numTokens } from "./chatgpt-numtokens";

const log = getLogger("llm:utils");

/** AI SDK usage shape returned by generateText / streamText (v6+). */
export interface AIUsage {
  inputTokens: number | undefined;
  outputTokens: number | undefined;
  totalTokens: number | undefined;
  inputTokenDetails: {
    noCacheTokens: number | undefined;
    cacheReadTokens: number | undefined;
    cacheWriteTokens: number | undefined;
  };
  outputTokenDetails: {
    textTokens: number | undefined;
    reasoningTokens: number | undefined;
  };
}

/**
 * Extract interesting token details for logging.
 *
 * AI SDK v6 standardises cache/reasoning details in the usage object itself
 * (inputTokenDetails, outputTokenDetails). We read from there first, then
 * fall back to providerMetadata for any provider-specific extras.
 */
export function extractTokenDetails(
  meta: Record<string, Record<string, unknown>> | undefined,
  usage?: AIUsage,
): Record<string, unknown> | undefined {
  const details: Record<string, unknown> = {};

  // Standardised token details from AI SDK v6 usage object
  if (usage) {
    if (usage.inputTokenDetails?.cacheReadTokens)
      details.cacheReadTokens = usage.inputTokenDetails.cacheReadTokens;
    if (usage.inputTokenDetails?.cacheWriteTokens)
      details.cacheWriteTokens = usage.inputTokenDetails.cacheWriteTokens;
    if (usage.outputTokenDetails?.reasoningTokens)
      details.reasoningTokens = usage.outputTokenDetails.reasoningTokens;
  }

  // Provider-specific extras from providerMetadata (may overlap with above)
  if (meta) {
    // DeepSeek caching (provider-specific fields not in standard usage)
    const ds = meta.deepseek;
    if (ds) {
      if (ds.promptCacheHitTokens)
        details.cacheHitTokens = ds.promptCacheHitTokens;
      if (ds.promptCacheMissTokens)
        details.cacheMissTokens = ds.promptCacheMissTokens;
    }
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
    (usage.inputTokens ?? 0) > 0
      ? usage.inputTokens!
      : numTokens(input) + historyTokens;
  const completion_tokens =
    (usage.outputTokens ?? 0) > 0 ? usage.outputTokens! : numTokens(output);
  // Prefer the provider's total when it exceeds prompt+completion (e.g.
  // thinking/cached tokens that aren't split out).  Fall back to the sum.
  const computed = prompt_tokens + completion_tokens;
  const total_tokens =
    (usage.totalTokens ?? 0) > computed ? usage.totalTokens! : computed;

  const tokensFromApi =
    (usage.inputTokens ?? 0) > 0 && (usage.outputTokens ?? 0) > 0;

  const tokenDetails = extractTokenDetails(providerMetadata, usage);

  log.debug(`${providerName} successful`, {
    prompt_tokens,
    completion_tokens,
    total_tokens,
    tokensFromApi,
    ...(tokenDetails ? { tokenDetails } : {}),
  });

  return { output, total_tokens, completion_tokens, prompt_tokens, tokensFromApi };
}
