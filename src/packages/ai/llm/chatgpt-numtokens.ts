import GPT3Tokenizer from "gpt3-tokenizer";

// a little bit of this code is replicated in
// packages/frontend/misc/openai.ts
const APPROX_CHARACTERS_PER_TOKEN = 8;
const tokenizer = new GPT3Tokenizer({ type: "gpt3" });

export function numTokens(content: string): number {
  // slice to avoid extreme slowdown "attack".
  return tokenizer.encode(content.slice(0, 32000 * APPROX_CHARACTERS_PER_TOKEN))
    .text.length;
}

export function totalNumTokens(messages: { content: string }[]): number {
  let s = 0;
  for (const { content } of messages) {
    s += numTokens(content);
  }
  return s;
}
