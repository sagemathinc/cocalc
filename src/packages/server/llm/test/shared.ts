import { db } from "@cocalc/database";
import { callback2 as cb2 } from "@cocalc/util/async-utils";

const OPENAI_KEY = process.env.COCALC_TEST_OPENAI_KEY;
const GOOGLE_GENAI_KEY = process.env.COCALC_TEST_GOOGLE_GENAI_KEY;
const MISTRAL_AI_KEY = process.env.COCALC_TEST_MISTRAL_AI_KEY;

export async function setupAPIKeys(): Promise<void> {
  await cb2(db().set_server_setting, {
    name: "openai_api_key",
    value: OPENAI_KEY,
    readonly: true,
  });
  await cb2(db().set_server_setting, {
    name: "google_vertexai_key",
    value: GOOGLE_GENAI_KEY,
    readonly: true,
  });
  await cb2(db().set_server_setting, {
    name: "mistral_api_key",
    value: MISTRAL_AI_KEY,
    readonly: true,
  });
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
