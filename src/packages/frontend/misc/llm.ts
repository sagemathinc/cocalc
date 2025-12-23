/*
 *  This file is part of CoCalc: Copyright © 2020-2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// cSpell:ignore tokenx

import { estimateTokenCount, sliceByTokens } from "tokenx";

import type { History } from "@cocalc/frontend/client/types";
import type { LanguageModel } from "@cocalc/util/db-schema/llm-utils";
import {
  getMaxTokens,
  isUserDefinedModel,
} from "@cocalc/util/db-schema/llm-utils";
import { getUserDefinedLLMByModel } from "@cocalc/frontend/frame-editors/llm/use-userdefined-llm";

import { timed } from "./timing";

export { getMaxTokens };

// if 6 is about right, 8 should be a good upper bound.
const APPROX_CHARACTERS_PER_TOKEN = 8;
const UPPER_BOUND_FACTOR = 1.3;

// Very fast estimate with no full tokenizer; wraps tokenx's heuristic.
const numTokensEstimateImpl = (content: string, maxTokens?: number): number => {
  if (!content) {
    return 0;
  }
  const estimate = estimateTokenCount(content);
  if (maxTokens != null && estimate > maxTokens) {
    return maxTokens;
  }
  return estimate;
};

export const numTokensEstimate = timed(
  "frontend/misc/llm.ts#numTokensEstimate",
  numTokensEstimateImpl,
);

const numTokensUpperBoundImpl = (
  content: string,
  maxTokens: number,
): number => {
  if (!content || maxTokens <= 0) {
    return 0;
  }
  const limit = maxTokens * APPROX_CHARACTERS_PER_TOKEN;
  const slice = content.length > limit ? content.slice(0, limit) : content;
  const estimate = estimateTokenCount(slice);
  const upperBound = Math.ceil(estimate * UPPER_BOUND_FACTOR);
  return Math.min(
    upperBound + Math.max(0, content.length - slice.length),
    content.length,
  );
};

export const numTokensUpperBound = timed(
  "frontend/misc/llm.ts#numTokensUpperBound",
  numTokensUpperBoundImpl,
);

/* We truncate the message.
For performance considerations, we may sometimes truncate too much text since we
use fast token estimates. We will never return too much text, only possible too
little.
*/

const dots = "\n ...";
const numDotsTokens = estimateTokenCount(dots);
const truncateMessageImpl = (content: string, maxTokens: number): string => {
  if (!content || maxTokens <= 0) {
    return "";
  }
  if (estimateTokenCount(content) > maxTokens) {
    const limit = Math.max(0, maxTokens - numDotsTokens);
    const truncated = sliceByTokens(content, 0, limit);
    if (truncated.length < content.length) {
      return truncated + dots;
    }
  }
  return content;
};

export const truncateMessage = timed(
  "frontend/misc/llm.ts#truncateMessage",
  truncateMessageImpl,
);

// This is not very clever or efficiently coded, obviously.  Could refine and make better...

const truncateHistoryImpl = (
  history: History,
  maxTokens: number,
  model: LanguageModel,
): History => {
  if (maxTokens <= 0) {
    return [];
  }
  // Try to get user-defined config if this is a user model
  const userConfig = isUserDefinedModel(model)
    ? getUserDefinedLLMByModel(model)
    : null;

  const modelMaxTokens = getMaxTokens(model, userConfig ?? undefined);
  const maxLength = modelMaxTokens * APPROX_CHARACTERS_PER_TOKEN;
  for (let i = 0; i < history.length; i++) {
    // Performance: ensure all entries in history are reasonably short, so they don't
    // cause token estimation and slicing below to take a long time.
    history[i].content = history[i].content.slice(0, maxLength);
  }

  const tokens = history.map(({ content }) =>
    numTokensUpperBoundImpl(content, modelMaxTokens),
  );
  while (true) {
    let total = 0;
    let largestScore = 0;
    let largestIndex = 0;
    for (let i = 0; i < tokens.length; i++) {
      total += tokens[i];
      // "score" weights early chats more
      const score = (tokens[i] * (tokens.length - i)) / 3;
      if (score > largestScore) {
        largestScore = score;
        largestIndex = i;
      }
    }
    if (total <= maxTokens) {
      // done!
      break;
    }
    // Do something to make number of tokens smaller.
    // This is purely a heuristic and there's a lot of speculation about what to do.
    // I just want to do *something* for now.
    // We truncate whatever scores highest by up to 20%, but never more than necessary.
    const before = tokens[largestIndex];
    const toRemove = Math.max(
      1,
      Math.min(total - maxTokens, Math.ceil(tokens[largestIndex] / 5)),
    );
    const target = Math.max(0, before - toRemove);
    const truncated = sliceByTokens(history[largestIndex].content, 0, target);
    const after = numTokensEstimateImpl(truncated, modelMaxTokens);
    if (before == after) {
      // ensure it definitely shrinks.
      tokens[largestIndex] = 0;
      history[largestIndex].content = "";
      continue;
    }
    tokens[largestIndex] = after;
    history[largestIndex].content = truncated;
  }
  return history;
};

export const truncateHistory = timed(
  "frontend/misc/llm.ts#truncateHistory",
  truncateHistoryImpl,
);
