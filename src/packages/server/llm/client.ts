/*
Get the client for the given LanguageModel.

You do not have to worry too much about throwing an exception, because they're caught in ./index::evaluate
*/

import { Configuration, OpenAIApi } from "openai";

import getLogger from "@cocalc/backend/logger";
import { getServerSettings } from "@cocalc/database/settings/server-settings";
import { LanguageModel, model2vendor } from "@cocalc/util/db-schema/openai";
import { unreachable } from "@cocalc/util/misc";
import { VertexAIClient } from "./vertex-ai-client";

const log = getLogger("llm:client");

const clientCache: { [key: string]: OpenAIApi | VertexAIClient } = {};

export default async function getClient(
  model?: LanguageModel,
): Promise<OpenAIApi | VertexAIClient> {
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
      const configuration = new Configuration({ apiKey });
      const client = new OpenAIApi(configuration);
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

    default:
      unreachable(vendor);
      throw new Error(`unknown vendor: ${vendor}`);
  }
}
