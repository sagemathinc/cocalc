import getLogger from "@cocalc/backend/logger";
import { db } from "@cocalc/database";
import { getServerSettings } from "@cocalc/database/settings";
import { callback2 } from "@cocalc/util/async-utils";
import { OTHER_SETTINGS_USERDEFINED_LLM } from "@cocalc/util/db-schema/defaults";
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
  log.debug(`evaluateUserDefinedLLM[${account_id}]`, opts);

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
  log.debug("conf", conf);
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
  const user_llm_json = row?.other_settings?.[OTHER_SETTINGS_USERDEFINED_LLM];
  try {
    for (const llm of JSON.parse(user_llm_json) as UserDefinedLLM[]) {
      if (llm.service === service && llm.model === model) {
        return llm;
      }
    }
  } catch (err) {
    log.error("Failed to parse user defined llm", user_llm_json, err);
    throw err;
  }
  return null;
}
