// This configures the test files in that directory
//
// By default, no tests are running.
// To enable them, first set the environment variable COCALC_TEST_LLM to "true".
// You also have to store the API key in the appropriate env var – see below.

import { db } from "@cocalc/database";
import { callback2 as cb2 } from "@cocalc/util/async-utils";
import { LLMServiceName } from "@cocalc/util/db-schema/llm-utils";
import { unreachable } from "@cocalc/util/misc";

const RUN_TESTS = process.env.COCALC_TEST_LLM === "true";
const OPENAI_KEY = process.env.COCALC_TEST_OPENAI_KEY;
const GOOGLE_GENAI_KEY = process.env.COCALC_TEST_GOOGLE_GENAI_KEY;
const MISTRAL_AI_KEY = process.env.COCALC_TEST_MISTRAL_AI_KEY;
const ANTHROPIC_KEY = process.env.COCALC_TEST_ANTHROPIC_KEY;

const MODEL_CONFIG_KEY = [
  ["openai_enabled", "openai_api_key", OPENAI_KEY],
  ["google_vertexai_enabled", "google_vertexai_key", GOOGLE_GENAI_KEY],
  ["mistral_enabled", "mistral_api_key", MISTRAL_AI_KEY],
  ["anthropic_enabled", "anthropic_api_key", ANTHROPIC_KEY],
] as const;

// must be a string and at least 1 char
function isSet(m: unknown) {
  if (typeof m !== "string") return false;
  return m.length >= 1;
}

export function have_llm(service: LLMServiceName) {
  if (!RUN_TESTS) return false;
  switch (service) {
    case "openai":
      return isSet(OPENAI_KEY);
    case "google":
      return isSet(GOOGLE_GENAI_KEY);
    case "mistralai":
      return isSet(MISTRAL_AI_KEY);
    case "anthropic":
      return isSet(ANTHROPIC_KEY);
    case "ollama":
    case "custom_openai":
      return false;
    case "user":
      return true;
    default:
      unreachable(service);
  }
}

export function test_llm(service: LLMServiceName) {
  return have_llm(service) ? describe : describe.skip;
}

export async function setupAPIKeys(): Promise<void> {
  for (const [_, name, value] of MODEL_CONFIG_KEY) {
    if (!value) continue;
    await cb2(db().set_server_setting, {
      name,
      value,
      readonly: true,
    });
  }
}

export async function enableModels(): Promise<void> {
  for (const [name, _, key] of MODEL_CONFIG_KEY) {
    await cb2(db().set_server_setting, {
      name,
      value: !!key ? "yes" : "no",
      readonly: true,
    });
  }
}
