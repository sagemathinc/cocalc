/*
Get openai client.
*/

import getLogger from "@cocalc/backend/logger";
import { Configuration, OpenAIApi } from "openai";
import { getServerSettings } from "@cocalc/database/settings/server-settings";

const log = getLogger("openai:client");

const clientCache: { [key: string]: OpenAIApi } = {};

export default async function getClient(): Promise<OpenAIApi> {
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
}
