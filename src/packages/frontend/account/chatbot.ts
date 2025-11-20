/*
We abuse the account_id field in some cases, especially chat, to also
be a string (not a uuid) to refer to various chatbots.  Any code that
displays or detects this *should* go through the functions below.

When new models are added, e.g., Claude soon (!), they will go here.

*/

import { redux } from "@cocalc/frontend/app-framework";
import { getUserDefinedLLMByModel } from "@cocalc/frontend/frame-editors/llm/use-userdefined-llm";
import {
  LANGUAGE_MODELS,
  LANGUAGE_MODEL_PREFIXES,
  LLM_USERNAMES,
  fromAnthropicService,
  fromCustomOpenAIModel,
  fromMistralService,
  fromOllamaModel,
  isAnthropicService,
  isCustomOpenAI,
  isMistralService,
  isOllamaLLM,
  isUserDefinedModel,
} from "@cocalc/util/db-schema/llm-utils";

// we either check if the prefix is one of the known ones (used in some circumstances)
// or if the account id is exactly one of the language models (more precise)
export function isChatBot(account_id?: string): boolean {
  if (typeof account_id !== "string") return false;
  return (
    LLM_USERNAMES[account_id] ||
    LANGUAGE_MODEL_PREFIXES.some((prefix) => account_id?.startsWith(prefix)) ||
    LANGUAGE_MODELS.some((model) => account_id === model) ||
    isOllamaLLM(account_id) ||
    isCustomOpenAI(account_id) ||
    isUserDefinedModel(account_id)
  );
}

export function chatBotName(account_id?: string): string {
  if (typeof account_id !== "string") return "ChatBot";
  if (LLM_USERNAMES[account_id]) return LLM_USERNAMES[account_id];
  if (account_id.startsWith("chatgpt")) {
    return LLM_USERNAMES[account_id] ?? "ChatGPT";
  }
  if (account_id.startsWith("openai-")) {
    return LLM_USERNAMES[account_id.slice("openai-".length)] ?? "ChatGPT";
  }
  if (account_id.startsWith("google-")) {
    return LLM_USERNAMES[account_id.slice("google-".length)] ?? "Gemini";
  }
  if (isMistralService(account_id)) {
    return LLM_USERNAMES[fromMistralService(account_id)] ?? "Mistral";
  }
  if (isAnthropicService(account_id)) {
    return LLM_USERNAMES[fromAnthropicService(account_id)] ?? "Anthropic";
  }
  if (isOllamaLLM(account_id)) {
    const ollama = redux.getStore("customize").get("ollama")?.toJS() ?? {};
    const key = fromOllamaModel(account_id);
    return ollama[key]?.display ?? "Ollama";
  }
  if (isCustomOpenAI(account_id)) {
    const custom_openai =
      redux.getStore("customize").get("custom_openai")?.toJS() ?? {};
    const key = fromCustomOpenAIModel(account_id);
    return custom_openai[key]?.display ?? "OpenAI (custom)";
  }
  if (isUserDefinedModel(account_id)) {
    const um = getUserDefinedLLMByModel(account_id);
    return um?.display ?? "ChatBot";
  }
  return "ChatBot";
}
