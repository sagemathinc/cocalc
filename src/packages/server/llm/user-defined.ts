import getLogger from "@cocalc/backend/logger";
import { db } from "@cocalc/database";
import { getServerSettings } from "@cocalc/database/settings";
import { callback2 } from "@cocalc/util/async-utils";
import { OTHER_SETTINGS_USER_DEFINED_LLM } from "@cocalc/util/db-schema/defaults";
import {
  UserDefinedLLM,
  UserDefinedLLMService,
  isUserDefinedModel,
  toOllamaModel,
  unpackUserDefinedLLMModel,
} from "@cocalc/util/db-schema/llm-utils";
import { isValidUUID, unreachable } from "@cocalc/util/misc";
import type { History, Stream } from "@cocalc/util/types/llm";
import { evaluateOllama } from "./ollama";
import { evaluateWithLangChain } from "./evaluate-lc";

const log = getLogger("llm:userdefined");

const REDACTED_VALUE = "[redacted]";
const SENSITIVE_KEYS = new Set([
  "apiKey",
  "openAIApiKey",
  "azureOpenAIApiKey",
  "api_key",
]);

interface UserDefinedOpts {
  input: string; // new input that user types
  system?: string; // extra setup that we add for relevance and context
  history?: History;
  model: string; // this must be user-[type-[model]]
  stream?: Stream;
  maxTokens?: number;
}

export async function evaluateUserDefinedLLM(
  opts: Readonly<UserDefinedOpts>,
  account_id?: string,
) {
  log.debug(`evaluateUserDefinedLLM[${account_id}]`, redactSensitive(opts));

  const { user_defined_llm } = await getServerSettings();
  if (!user_defined_llm) {
    throw new Error("User Defined LLMs are disabled");
  }

  const { model } = opts;
  if (!isUserDefinedModel(model)) {
    throw new Error(`Invalid user defined model ${model} /1`);
  }

  const um = unpackUserDefinedLLMModel(model);
  if (um == null) {
    throw new Error(`Invalid user defined model ${model} /2`);
  }

  const conf = await getConfig(account_id, um.service, um.model);
  log.debug("conf", redactSensitive(conf));
  if (conf == null) {
    throw new Error(`Unable to retrieve user defined model ${model}`);
  }

  // Pull the user-defined LLM config from the account settings and evaluate via the unified
  // LangChain path, passing through user-supplied API keys/endpoints.
  const { service, endpoint, apiKey } = conf;
  switch (service) {
    case "ollama": {
      return await evaluateOllama({
        ...opts,
        model: toOllamaModel(conf.model),
        endpoint,
        maxTokens: conf.max_tokens,
      });
    }
    case "openai":
    case "google":
    case "anthropic":
    case "mistralai":
    case "custom_openai":
    case "xai":
      return await evaluateWithLangChain(
        {
          ...opts,
          model: conf.model,
          apiKey,
          endpoint: endpoint || undefined, // don't pass along empty strings!
          service,
          maxTokens: conf.max_tokens, // Use max_tokens from config
        },
        "user",
      );
    default:
      unreachable(service);
      throw new Error(`Invalid user defined model ${model} /3`);
  }
}

async function getConfig(
  account_id: string | undefined,
  service: UserDefinedLLMService,
  model: string,
): Promise<UserDefinedLLM | null> {
  if (!isValidUUID(account_id)) {
    throw new Error(`Invalid account_id ${account_id}`);
  }
  const theDb = db();
  const row = await callback2(theDb.get_account, {
    account_id,
    columns: ["other_settings"],
  });
  const user_llm_json = row?.other_settings?.[OTHER_SETTINGS_USER_DEFINED_LLM];
  try {
    for (const llm of JSON.parse(user_llm_json) as UserDefinedLLM[]) {
      if (llm.service === service && llm.model === model) {
        return llm;
      }
    }
  } catch (err) {
    log.error(
      "Failed to parse user defined llm",
      redactUserLLMJson(user_llm_json),
      err,
    );
    throw err;
  }
  return null;
}

function redactSensitive(value: any): any {
  if (value == null) {
    return value;
  }
  if (typeof value === "function") {
    return value;
  }
  if (typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitive(item));
  }
  if (value instanceof Date) {
    return value;
  }
  const output: Record<string, any> = {};
  for (const [key, val] of Object.entries(value)) {
    output[key] = SENSITIVE_KEYS.has(key)
      ? REDACTED_VALUE
      : redactSensitive(val);
  }
  return output;
}

function redactUserLLMJson(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }
  try {
    const parsed = JSON.parse(value);
    return JSON.stringify(redactSensitive(parsed));
  } catch (_err) {
    return redactSensitiveString(value);
  }
}

function redactSensitiveString(value: string): string {
  let redacted = value;
  for (const key of SENSITIVE_KEYS) {
    const regex = new RegExp(`("${key}"\\s*:\\s*")([^"]*)(")`, "g");
    redacted = redacted.replace(regex, `$1${REDACTED_VALUE}$3`);
  }
  return redacted;
}
