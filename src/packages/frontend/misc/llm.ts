// NOTE! This tokenizer bundle is large, so be sure to async load it by clients
// of this code.
import { decode, encode } from "gpt-tokenizer";

import type { History } from "@cocalc/frontend/client/types";
import type { LanguageModel } from "@cocalc/util/db-schema/llm-utils";
import { getMaxTokens } from "@cocalc/util/db-schema/llm-utils";

export { getMaxTokens };

// "For an average English text, it's reasonable to assume that each word is
//  about 5 characters long on average, and there is a space character between
// each word. So, for every 6 characters, there is approximately one token."
// Using this, our 250,000 character text gets truncated down to 6*4096 ~ 25,000
// and then running the tokenizer is fast: it takes 62ms instead of nearly 6 seconds!

// if 6 is about right, 8 should be a good upper bound.
const APPROX_CHARACTERS_PER_TOKEN = 8;

// gpt-tokenizer defaults to o200k_base, which is the encoding used by GPT-5.

// WARNING: --  tokenizer.encode is blocking and can be slow, e.g., if you give it
// content of length 250,000 it'll take 6 seconds and make the browser freeze.
// So don't do that.  Whereas if you give it 25,000 it takes 60ms. The following
// function just returns an upper bound on the number of tokens, to see if any
// truncation might be needed. We use the above heuristic of ~ 6 characters per token.

export function numTokensUpperBound(
  content: string,
  maxTokens: number,
): number {
  return (
    encode(content.slice(0, maxTokens * APPROX_CHARACTERS_PER_TOKEN)).length +
    Math.max(0, content.length - maxTokens * APPROX_CHARACTERS_PER_TOKEN)
  );
}

/* We truncate the message.
For performance considerations (see WARNING by numTokensEstimate above),
we may sometimes truncate too much text, since we first compute an estimate on the number
of tokens using a heuristic, then do a full tokenization and truncation after
that.  We will never return too much text, only possible too little.
*/

const dots = "\n ...";
const numDotsTokens = encode(dots).length;
export function truncateMessage(content: string, maxTokens: number): string {
  content = content.slice(0, maxTokens * APPROX_CHARACTERS_PER_TOKEN); // see performance remarks above.
  const tokens = encode(content);
  if (tokens.length > maxTokens) {
    return decode(tokens.slice(0, maxTokens - numDotsTokens)) + dots;
  }
  return content;
}

// This is not very clever or efficiently coded, obviously.  Could refine and make better...

export function truncateHistory(
  history: History,
  maxTokens: number,
  model: LanguageModel,
): History {
  if (maxTokens <= 0) {
    return [];
  }
  const maxLength = getMaxTokens(model) * APPROX_CHARACTERS_PER_TOKEN;
  for (let i = 0; i < history.length; i++) {
    // Performance: ensure all entries in history are reasonably short, so they don't
    // cause "tokenizer.encode(content)" below to take a long time.
    history[i].content = history[i].content.slice(0, maxLength);
  }

  const tokens = history.map(({ content }) => encode(content));
  while (true) {
    let total = 0;
    let largestScore = 0;
    let largestIndex = 0;
    for (let i = 0; i < tokens.length; i++) {
      total += tokens[i].length;
      // "score" weights early chats more
      const score = (tokens[i].length * (tokens.length - i)) / 3;
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
    const before = tokens[largestIndex].length;
    const toRemove = Math.max(
      1,
      Math.min(maxTokens - total, Math.ceil(tokens[largestIndex].length / 5)),
    );
    tokens[largestIndex] = tokens[largestIndex].slice(0, -toRemove);
    const after = tokens[largestIndex].length;
    if (before == after) {
      // ensure it definitely shrinks.
      tokens[largestIndex] = [];
    }
    history[largestIndex].content = decode(tokens[largestIndex]);
  }
  return history;
}
