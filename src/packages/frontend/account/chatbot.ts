/*
We abuse the account_id field in some cases, especially chat, to also
be a string (not a uuid) to refer to various chatbots.  Any code that
displays or detects this *should* go through the functions below.

When new models are added, e.g., Claude soon (!), they will go here.

*/

import { redux } from "@cocalc/frontend/app-framework";
import {
  LANGUAGE_MODEL_PREFIXES,
  LLM_USERNAMES,
  MODELS,
  Vendor,
  fromOllamaModel,
  isOllamaLLM,
  model2vendor,
} from "@cocalc/util/db-schema/llm";

// we either check if the prefix is one of the known ones (used in some circumstances)
// or if the account id is exactly one of the language models (more precise)
export function isChatBot(account_id?: string): boolean {
  if (typeof account_id !== "string") return false;
  return (
    LANGUAGE_MODEL_PREFIXES.some((prefix) => account_id?.startsWith(prefix)) ||
    MODELS.some((model) => account_id === model) ||
    isOllamaLLM(account_id)
  );
}

export function getChatBotVendor(account_id?: string): Vendor {
  if (account_id == null) {
    return "openai";
  }
  return model2vendor(account_id as any);
}

export function chatBotName(account_id?: string): string {
  if (account_id?.startsWith("chatgpt")) {
    return LLM_USERNAMES[account_id] ?? "ChatGPT";
  }
  if (account_id?.startsWith("openai-")) {
    return LLM_USERNAMES[account_id.slice("openai-".length)] ?? "ChatGPT";
  }
  if (account_id?.startsWith("google-")) {
    return LLM_USERNAMES[account_id.slice("google-".length)] ?? "Gemini";
  }
  if (typeof account_id === "string" && isOllamaLLM(account_id)) {
    const ollama = redux.getStore("customize").get("ollama")?.toJS() ?? {};
    const key = fromOllamaModel(account_id);
    return ollama[key]?.display ?? "Ollama";
  }
  return "ChatBot";
}
