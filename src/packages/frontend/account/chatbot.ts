/*
We abuse the account_id field in some cases, especially chat, to also
be a string (not a uuid) to refer to various chatbots.  Any code that
displays or detects this *should* go through the functions below.

When new models are added, e.g., Claude soon (!), they will go here.

*/

import {
  LANGUAGE_MODEL_PREFIXES,
  LLM_USERNAMES,
} from "@cocalc/util/db-schema/openai";

export function isChatBot(account_id?: string) {
  return LANGUAGE_MODEL_PREFIXES.some((prefix) =>
    account_id?.startsWith(prefix),
  );
}

export function chatBotName(account_id?: string): string {
  if (account_id?.startsWith("chatgpt")) {
    return LLM_USERNAMES[account_id] ?? "ChatGPT";
  }
  if (account_id?.startsWith("openai-")) {
    return LLM_USERNAMES[account_id.slice("openai-".length)] ?? "ChatGPT";
  }
  if (account_id?.startsWith("google-")) {
    return LLM_USERNAMES[account_id.slice("google-".length)] ?? "PaLM 2";
  }
  return "ChatBot";
}
