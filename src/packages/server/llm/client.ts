/*
Get the client for the given LanguageModel.

You do not have to worry too much about throwing an exception, because they're caught in ./index::evaluate
*/

import { Ollama } from "@langchain/community/llms/ollama";
import jsonStable from "json-stable-stringify";
import * as _ from "lodash";
import OpenAI from "openai";

import getLogger from "@cocalc/backend/logger";
import { getServerSettings } from "@cocalc/database/settings/server-settings";
import { LanguageModel, model2vendor } from "@cocalc/util/db-schema/llm";
import { unreachable } from "@cocalc/util/misc";
import { VertexAIClient } from "./vertex-ai-client";

const log = getLogger("llm:client");

const clientCache: { [key: string]: OpenAI | VertexAIClient } = {};

export async function getClient(
  model?: LanguageModel,
): Promise<OpenAI | VertexAIClient> {
  const vendor = model == null ? "openai" : model2vendor(model);

  switch (vendor) {
    case "openai":
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

    case "google":
      const { google_vertexai_key } = await getServerSettings();
      const key = `google:${google_vertexai_key}-${model}`;
      if (clientCache[key]) {
        return clientCache[key];
      }
      if (!google_vertexai_key) {
        log.warn("requested google vertexai key, but it's not configured");
        throw Error("google vertexai not configured");
      }

      if (!model) {
        throw Error("this should never happen");
      }

      const vai = new VertexAIClient({ apiKey: google_vertexai_key }, model);
      clientCache[key] = vai;
      return vai;

    case "ollama":
      throw new Error("Use the getOllama function instead");

    default:
      unreachable(vendor);
      throw new Error(`unknown vendor: ${vendor}`);
  }
}

const ollamaCache: { [key: string]: Ollama } = {};

/**
 * The idea here is: the ollama config contains all available endpoints and their configuration.
 * The "model" is the unique key in the ollama_configuration mapping, it was prefixed by "ollama-".
 * For the actual Ollama client instantitation, we pick the model parameter from the config or just use the unique model name as a fallback.
 * In particular, this means you can query the same Ollama model with differnet parameters, or even have several ollama servers running.
 * All other config parameters are passed to the Ollama constructor (e.g. topK, temperature, etc.).
 */
export async function getOllama(model: string) {
  if (model.startsWith("ollama-")) {
    throw new Error(
      `At this point, the model name should no longer have the "ollama-" prefix`,
    );
  }

  const settings = await getServerSettings();
  const config = settings.ollama_configuration?.[model];
  if (!config) {
    throw new Error(
      `Ollama model ${model} not configured – you have to create an entry {${model}: {baseUrl: "https://...", ...}} in the "Ollama Configuration" entry of the server settings!`,
    );
  }

  // the key is a hash of the model name and the specific config – such that changes in the config will invalidate the cache
  const key = `${model}:${jsonStable(config)}`;

  // model is the unique key in the ServerSettings.ollama_configuration mapping
  if (ollamaCache[key]) {
    log.debug(`Using cached Ollama client for model ${model}`);
    return ollamaCache[key];
  }

  const baseUrl = config.baseUrl;

  if (!baseUrl) {
    throw new Error(
      `The "baseUrl" field of the Ollama model ${model} is not configured`,
    );
  }

  const keepAlive = config.keepAlive ?? -1;

  // extract all other properties from the config, except the url, model, keepAlive field and the "cocalc" field
  const other = _.omit(config, ["baseUrl", "model", "keepAlive", "cocalc"]);
  const ollamaConfig = {
    baseUrl,
    model: config.model ?? model,
    keepAlive,
    ...other,
  };

  log.debug("Instantiating Ollama client with config", ollamaConfig);

  const client = new Ollama(ollamaConfig);
  ollamaCache[key] = client;
  return client;
}
