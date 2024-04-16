import { db } from "@cocalc/database";
import { callback2 as cb2 } from "@cocalc/util/async-utils";
import { LLMServiceName } from "@cocalc/util/db-schema/llm-utils";
import { unreachable } from "@cocalc/util/misc";

const OPENAI_KEY = process.env.COCALC_TEST_OPENAI_KEY;
const GOOGLE_GENAI_KEY = process.env.COCALC_TEST_GOOGLE_GENAI_KEY;
const MISTRAL_AI_KEY = process.env.COCALC_TEST_MISTRAL_AI_KEY;
const ANTHROPIC_KEY = process.env.COCALC_TEST_ANTHROPIC_KEY;

function have_llm(service: LLMServiceName) {
  switch (service) {
    case "openai":
      return !!OPENAI_KEY;
    case "google":
      return !!GOOGLE_GENAI_KEY;
    case "mistralai":
      return !!MISTRAL_AI_KEY;
    case "anthropic":
      return !!ANTHROPIC_KEY;
    case "ollama":
      return false;
    default:
      unreachable(service);
  }
}

export function test_llm(service: LLMServiceName) {
  return have_llm(service) ? describe : describe.skip;
}

export async function setupAPIKeys(): Promise<void> {
  const kv = [
    ["openai_api_key", OPENAI_KEY],
    ["google_vertexai_key", GOOGLE_GENAI_KEY],
    ["mistral_api_key", MISTRAL_AI_KEY],
    ["anthropic_api_key", ANTHROPIC_KEY],
  ] as const;

  for (const [name, value] of kv) {
    if (!value) continue;
    await cb2(db().set_server_setting, {
      name,
      value,
      readonly: true,
    });
  }
}

export async function enableModels(): Promise<void> {
  for (const name of [
    "openai_enabled",
    "google_vertexai_enabled",
    "mistral_enabled",
  ]) {
    await cb2(db().set_server_setting, {
      name,
      value: "yes",
      readonly: true,
    });
  }
}
