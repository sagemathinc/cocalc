import { encode } from "gpt-3-encoder";

export function numTokens(input: string): number {
  return encode(input).length;
}

export interface Message {
  role: "assistant" | "user" | "system";
  content: string;
}

export type History = Message[];

export function truncateChatGPTHistoryToFit(
  history: History,
  maxTokens: number
): History {
  console.log({ maxTokens, history });
  return history;
}
