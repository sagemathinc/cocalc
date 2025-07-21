import { Ollama, OllamaInput } from "@langchain/ollama";
import { ChatOpenAI as ChatOpenAILC } from "@langchain/openai";

import getLogger from "@cocalc/backend/logger";
import { db } from "@cocalc/database";
import { getServerSettings } from "@cocalc/database/settings";
import { callback2 } from "@cocalc/util/async-utils";
import { OTHER_SETTINGS_USERDEFINED_LLM } from "@cocalc/util/db-schema/defaults";
import {
  UserDefinedLLM,
  UserDefinedLLMService,
  isUserDefinedModel,
  toCustomOpenAIModel,
  toOllamaModel,
  unpackUserDefinedLLMModel,
} from "@cocalc/util/db-schema/llm-utils";
import { isValidUUID, unreachable } from "@cocalc/util/misc";
import type { History, Stream } from "@cocalc/util/types/llm";
import { evaluateCustomOpenAI } from "./custom-openai";
import { evaluateOllama } from "./ollama";
// import { evaluateWithLangChain } from "./evaluate-lc";
import { evaluateAnthropic } from "./anthropic";
import { evaluateMistral } from "./mistral";
import { evaluateGoogleGenAILC } from "./google-lc";
import { evaluateOpenAILC } from "./openai-lc";

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

  // Below, the general idea is to extract the user defined llm from the accounts table,
  // and then construct the corresponding client (maybe with a use provided API key)
  // and call the appropriate evaluation function. For that, it mimics how the llm framework
  // usually calls an LLM.
  // NOTE: evaluateWithLangChain "could" work after further refactoring. In particular, its
  // getProviderConfig must be enhanced with a generalized way to configure based on provider, not model name
  const { service, endpoint, apiKey } = conf;
  switch (service) {
    case "custom_openai": {
      // https://js.langchain.com/v0.2/docs/integrations/llms/openai/
      const oic: ConstructorParameters<typeof ChatOpenAILC>["0"] = {
        model: conf.model,
      };
      if (endpoint) {
        oic.configuration = { baseURL: endpoint };
      }
      // According to the docs, only apiKey should be set, but somehow gpt- models are a special case
      if (apiKey) {
        oic.apiKey = apiKey;
        oic.openAIApiKey = apiKey;
      }
      const client = new ChatOpenAILC(oic);
      return await evaluateCustomOpenAI(
        { ...opts, model: toCustomOpenAIModel(conf.model) },
        client,
      );
    }
    case "ollama": {
      const oc: OllamaInput = {
        model: conf.model,
        baseUrl: conf.endpoint,
      };
      if (conf.apiKey) {
        oc.headers = new Headers();
        oc.headers.set("Authorization", `Bearer ${conf.apiKey}`);
      }
      const client = new Ollama(oc);
      return await evaluateOllama(
        { ...opts, model: toOllamaModel(conf.model) },
        client,
      );
    }

    case "anthropic":
      return await evaluateAnthropic(
        { ...opts, model: um.model, apiKey: conf.apiKey },
        "user",
      );
    // return await evaluateWithLangChain(
    //   {
    //     ...opts,
    //     model: um.model,
    //     apiKey: conf.apiKey,
    //   },
    //   "user",
    // );

    case "mistralai":
      return await evaluateMistral(
        { ...opts, model: um.model, apiKey: conf.apiKey },
        "user",
      );
    // return await evaluateWithLangChain(
    //   {
    //     ...opts,
    //     model: um.model,
    //     apiKey: conf.apiKey,
    //   },
    //   "user",
    // );

    case "google":
      return await evaluateGoogleGenAILC(
        { ...opts, model: um.model, apiKey: conf.apiKey },
        "user",
      );
    // return await evaluateWithLangChain(
    //   {
    //     ...opts,
    //     model: um.model,
    //     apiKey: conf.apiKey,
    //   },
    //   "user",
    // );

    case "openai":
      return await evaluateOpenAILC(
        { ...opts, model: um.model, apiKey: conf.apiKey },
        "user",
      );
    // return await evaluateWithLangChain(
    //   {
    //     ...opts,
    //     model: um.model,
    //     apiKey: conf.apiKey,
    //   },
    //   "user",
    // );

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
