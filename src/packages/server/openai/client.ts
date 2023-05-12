/*
Get openai client.
*/

import getLogger from "@cocalc/backend/logger";
import { Configuration, OpenAIApi } from "openai";
import { getServerSettings } from "@cocalc/server/settings/server-settings";

const log = getLogger("openai:client");

let _client: OpenAIApi | null = null;
export default async function getClient(): Promise<OpenAIApi> {
  if (_client != null) {
    return _client;
  }
  const { openai_api_key: apiKey } = await getServerSettings();
  if (!apiKey) {
    log.warn("requested openai api key, but it's not configured");
    throw Error("openai not configured");
  }

  log.debug("creating openai client...");
  const configuration = new Configuration({ apiKey });
  const client = new OpenAIApi(configuration);
  _client = client;
  return client;
}
