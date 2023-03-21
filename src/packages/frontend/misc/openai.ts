// NOTE! This gpt-3-tokenizer is LARGE, e.g., 1.6MB, so be
// sure to async load it by clients of this code.
import GPT3Tokenizer from "gpt3-tokenizer";

const tokenizer = new GPT3Tokenizer({ type: "gpt3" });

export function numTokens(content: string): number {
  return tokenizer.encode(content).text.length;
}

export interface Message {
  role: "assistant" | "user" | "system";
  content: string;
}

export type History = Message[];

export function truncateMessage(content: string, maxTokens: number): string {
  const { text } = tokenizer.encode(content);
  if (text.length > maxTokens) {
    return text.slice(0, maxTokens).join("");
  }
  return content;
}

// This is not very clever or efficiently coded, obviously.  Could refine and make better...

export function truncateHistory(history: History, maxTokens: number): History {
  if (maxTokens <= 0) {
    return [];
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
