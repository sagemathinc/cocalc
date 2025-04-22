/*
Get the client for the given LanguageModel.

You do not have to worry too much about throwing an exception, because they're caught in ./index::evaluate
*/

import { Ollama } from "@langchain/ollama";
import { ChatOpenAI as ChatOpenAILC } from "@langchain/openai";
import { omit } from "lodash";
import OpenAI from "openai";

import getLogger from "@cocalc/backend/logger";
import { getServerSettings } from "@cocalc/database/settings/server-settings";
import {
  LanguageModel,
  isCustomOpenAI,
  isGoogleModel,
  isOllamaLLM,
  model2vendor,
} from "@cocalc/util/db-schema/llm-utils";
import { unreachable } from "@cocalc/util/misc";
import { GoogleGenAIClient } from "./google-genai-client";

const log = getLogger("llm:client");

const clientCache: { [key: string]: OpenAI | GoogleGenAIClient } = {};

export async function getClient(
  model?: LanguageModel,
): Promise<OpenAI | GoogleGenAIClient> {
  if (model == null) {
    throw new Error("llm: model not specified");
  }

  const vendorName = model2vendor(model).name;

  switch (vendorName) {
    case "openai": {
      const { openai_api_key: apiKey } = await getServerSettings();
      if (clientCache[apiKey]) {
        return clientCache[apiKey];
      }
      if (!apiKey) {
        log.warn("requested openai api key, but it's not configured");
        throw Error("openai not configured");
      }

      log.debug("creating openai client...");
      const client = new OpenAI({ apiKey });
      clientCache[apiKey] = client;
      return client;
    }

    case "google": {
      // This is a GenAI API key
      const { google_vertexai_key: apiKey } = await getServerSettings();
      if (!apiKey) {
        log.warn("requested google vertexai key, but it's not configured");
        throw Error("google vertexai not configured");
      }

      if (!isGoogleModel(model)) {
        throw Error("this should never happen");
      }

      // ATTN: do not cache the instance. I saw suspicious errors, better to clean up the memory each time.
      return new GoogleGenAIClient({ apiKey }, model);
    }

    case "ollama":
      throw new Error("Use the getOllama function instead");

    case "custom_openai":
      throw new Error("Use the getCustomOpenAI function instead");

    case "mistralai":
      throw new Error("Use the evaluateMistral function instead");

    case "anthropic":
      throw new Error("Use the evaluateAnthropic function instead");

    case "user":
      throw new Error(
        "This should never happen, user defined LLMs must be unpacked.",
      );

    default:
      unreachable(vendorName);
      throw new Error(`unknown vendor: ${vendorName}`);
  }
}

/**
 * The idea here is: the ollama config contains all available endpoints and their configuration.
 * The "model" is the unique key in the ollama_configuration mapping, it was prefixed by $OLLAMA_PREFIX.
 * For the actual Ollama client instantitation, we pick the model parameter from the config or just use the unique model name as a fallback.
 * In particular, this means you can query the same Ollama model with differnet parameters, or even have several ollama servers running.
 * All other config parameters are passed to the Ollama constructor (e.g. topK, temperature, etc.).
 *
 * ATTN: do not cache the Ollama instance, we don't know if there are side effects
 */
export async function getOllama(model: string) {
  if (isOllamaLLM(model)) {
    throw new Error(
      `At this point, the model name should be one of Ollama, but it was ${model}`,
    );
  }

  const settings = await getServerSettings();
  const config = settings.ollama_configuration?.[model];
  if (!config) {
    throw new Error(
      `Ollama model ${model} not configured – you have to create an entry {${model}: {baseUrl: "https://...", ...}} in the "Ollama Configuration" entry of the server settings!`,
    );
  }

  if (config.cocalc?.disabled) {
    throw new Error(`Ollama model ${model} is disabled`);
  }

  const baseUrl = config.baseUrl;

  if (!baseUrl) {
    throw new Error(
      `The "baseUrl" field of the Ollama model ${model} is not configured`,
    );
  }

  // this means the model is kept in the GPU memory for 24 hours – by default its only a few minutes or so
  const keepAlive: string = config.keepAlive ?? "24h";

  // extract all other properties from the config, except the url, model, keepAlive field and the "cocalc" field
  const other = omit(config, ["baseUrl", "model", "keepAlive", "cocalc"]);
  const ollamaConfig = {
    baseUrl,
    model: config.model ?? model,
    keepAlive,
    ...other,
  };

  log.debug("Instantiating Ollama client with config", ollamaConfig);

  const client = new Ollama(ollamaConfig);
  return client;
}

export async function getCustomOpenAI(model: string) {
  if (isCustomOpenAI(model)) {
    throw new Error(
      `At this point, the model name should be one of the custom openai models, but it was ${model}`,
    );
  }

  const settings = await getServerSettings();
  const config = settings.custom_openai_configuration?.[model];
  if (!config) {
    throw new Error(
      `Custom OpenAI model ${model} not configured – you have to create an entry {${model}: {baseUrl: "https://...", ...}} in the "Custom OpenAI Configuration" entry of the server settings!`,
    );
  }

  if (config.cocalc?.disabled) {
    throw new Error(`Custom OpenAI model ${model} is disabled`);
  }

  const baseURL = config.baseUrl;

  if (!baseURL) {
    throw new Error(
      `The "baseUrl" field of the Custom OpenAI model ${model} is not configured`,
    );
  }

  // extract all other properties from the config, except the url, model, keepAlive field and the "cocalc" field
  const other = omit(config, ["baseUrl", "model", "keepAlive", "cocalc"]);
  const customOpenAIConfig = {
    configuration: { baseURL }, // https://js.langchain.com/docs/integrations/chat/openai/#custom-urls
    model: config.model ?? model,
    ...other,
  };

  log.debug(
    "Instantiating Custom OpenAI client with config (omitting api keys)",
    omit(customOpenAIConfig, ["apiKey", "openAIApiKey", "azureOpenAIApiKey"]),
  );

  // https://js.langchain.com/docs/integrations/chat/openai/
  const client = new ChatOpenAILC(customOpenAIConfig);
  return client;
}
