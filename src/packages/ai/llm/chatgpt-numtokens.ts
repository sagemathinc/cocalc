export type TokenCounter = (content: string) => number;

// Lightweight heuristic fallback: assume ~4 characters per token, capped to
// an upper bound to avoid pathological inputs.
const APPROX_CHARACTERS_PER_TOKEN = 4;

export const heuristicNumTokens: TokenCounter = (content: string) => {
  return Math.ceil(content.length / APPROX_CHARACTERS_PER_TOKEN);
};

export const numTokens = heuristicNumTokens;

export function totalNumTokens(messages: { content: string }[]): number {
  let s = 0;
  for (const { content } of messages) {
    s += numTokens(content);
  }
  return s;
}
