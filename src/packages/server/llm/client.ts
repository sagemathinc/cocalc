/*
Get the client for the given LanguageModel.

You do not have to worry too much about throwing an exception, because they're caught in ./index::evaluate
*/

import OpenAI from "openai";

import getLogger from "@cocalc/backend/logger";
import { getServerSettings } from "@cocalc/database/settings/server-settings";
import { LanguageModel, model2vendor } from "@cocalc/util/db-schema/openai";
import { unreachable } from "@cocalc/util/misc";
import { VertexAIClient } from "./vertex-ai-client";
import { Ollama } from "@langchain/community/llms/ollama";

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

export async function getOllama(model: string) {
  // model is the unique key in the ServerSettings.ollama_configuration mapping
  if (ollamaCache[model]) {
    return ollamaCache[model];
  }

  const settings = await getServerSettings();
  const config = settings.ollama_configuration?.[model];
  if (!config) {
    throw new Error(
      `Ollama model ${model} not configured – you have to create an entry {${model}: {url: "https://...", ...}} in the "Ollama Configuration" entry of the server settings`,
    );
  }

  const baseUrl = config.url;

  if (!baseUrl) {
    throw new Error(`The url of the Ollama model ${model} is not configured`);
  }

  const keepAlive = config.keepAlive ?? -1;

  const client = new Ollama({ baseUrl, model, keepAlive });
  ollamaCache[model] = client;
  return client;
}
