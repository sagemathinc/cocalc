/*
This is the lightweight analogue of @cocalc/server/llm
*/

import {
  evaluateWithLangChain,
  evaluateOllama,
  heuristicNumTokens,
} from "@cocalc/ai/llm";
import { init as initConatLLM } from "@cocalc/conat/llm/server";
import { isOllamaLLM } from "@cocalc/util/db-schema/llm-utils";
import { listRows } from "./sqlite/database";

function buildContext() {
  const settings: Record<string, any> = {};
  for (const row of listRows("server_settings") as {
    name?: string;
    value?: any;
  }[]) {
    if (row.name) {
      settings[row.name] = row.value;
    }
  }

  return {
    settings: {
      openai_api_key: settings.openai_api_key,
      google_vertexai_key: settings.google_vertexai_key,
      anthropic_api_key: settings.anthropic_api_key,
      mistral_api_key: settings.mistral_api_key,
    },
    mode: "user" as const,
    tokenCounter: heuristicNumTokens,
  };
}

export async function init(): Promise<void> {
  await initConatLLM(async (opts: any) => {
    const context = buildContext();
    if (isOllamaLLM(opts.model)) {
      return evaluateOllama(opts);
    }
    return evaluateWithLangChain(opts, context);
  });
}
