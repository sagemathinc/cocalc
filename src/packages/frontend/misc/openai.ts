// NOTE! This gpt-3-tokenizer is LARGE, e.g., 1.6MB, so be
// sure to async load it by clients of this code.
import GPT3Tokenizer from "gpt3-tokenizer";

export const MAX_CHATGPT_TOKENS = 4096;

// "For an average English text, it's reasonable to assume that each word is
//  about 5 characters long on average, and there is a space character between
// each word. So, for every 6 characters, there is approximately one token."
// Using this, our 250,000 character text gets truncated down to 6*4096 ~ 25,000
// and then runnin the tokenizer is fast: it takes 62ms instead of nearly 6 seconds!
const MAX_CHATGPT_LENGTH = MAX_CHATGPT_TOKENS * 6;

const tokenizer = new GPT3Tokenizer({ type: "gpt3" });

// WARNING: --  tokenizer.encode is blocking and can be slow, e.g., if you give it
// content of length 250,000 it'll take 6 seconds and make the browser freeze.
// So don't do that.  Whereas if you give it 25,000 it takes 60ms. The following
// function just returns an upper bound on the number of tokens, to see if any
// truncation might be needed.
export function numTokensUpperBound(content: string): number {
  return (
    tokenizer.encode(content.slice(0, MAX_CHATGPT_LENGTH)).text.length +
    Math.max(0, content.length - MAX_CHATGPT_LENGTH)
  );
}

export interface Message {
  role: "assistant" | "user" | "system";
  content: string;
}

export type History = Message[];

/* We truncate the message.
For performance considerations (see WARNING by numTokensEstimate above),
we may sometimes truncate too much text, since we first compute an estimate on the number
of tokens using the following heuristic, then do a full tokenization and truncation after
that.  We will never return too much text, only possible too little.
*/

const dots = "\n ...";
const numDotsTokens = numTokensUpperBound(dots);
export function truncateMessage(content: string, maxTokens: number): string {
  content = content.slice(0, MAX_CHATGPT_LENGTH); // see performance remarks above.
  const { text } = tokenizer.encode(content);
  if (text.length > maxTokens) {
    return text.slice(0, maxTokens - numDotsTokens).join("") + dots;
  }
  return content;
}

// This is not very clever or efficiently coded, obviously.  Could refine and make better...

export function truncateHistory(history: History, maxTokens: number): History {
  if (maxTokens <= 0) {
    return [];
  }
  for (let i = 0; i < history.length; i++) {
    // Performance: ensure all entries in history are reasonably short, so they don't
    // cause "tokenizer.encode(content)" below to take a long time.
    history[i].content = history[i].content.slice(0, MAX_CHATGPT_LENGTH);
  }

  const tokens = history.map(({ content }) => tokenizer.encode(content).text);
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
      Math.min(maxTokens - total, Math.ceil(tokens[largestIndex].length / 5))
    );
    tokens[largestIndex] = tokens[largestIndex].slice(0, -toRemove);
    const after = tokens[largestIndex].length;
    if (before == after) {
      // ensure it definitely shrinks.
      tokens[largestIndex] = [];
    }
    history[largestIndex].content = tokens[largestIndex].join("");
  }
  return history;
}
