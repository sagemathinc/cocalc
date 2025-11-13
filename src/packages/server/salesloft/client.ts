/*
Get Salesloft client.
*/

import axios from "axios";
import type { AxiosInstance } from "axios";
import getLogger from "@cocalc/backend/logger";
import { getServerSettings } from "@cocalc/database/settings/server-settings";

const log = getLogger("salesloft:client");

const clientCache: { [key: string]: AxiosInstance } = {};
const salesloftApiBaseUrl = "https://api.salesloft.com/v2";

export default async function getClient(): Promise<any> {
  const { salesloft_api_key: apiKey } = await getServerSettings();
  if (clientCache[apiKey]) {
    return clientCache[apiKey];
  }
  if (!apiKey) {
    log.warn("requested salesloft api key, but it's not configured");
    throw Error("salesloft not configured");
  }

  log.debug("creating salesloft client...");
  const client = axios.create({
    baseURL: salesloftApiBaseUrl,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  });
  clientCache[apiKey] = client;
  return client;
}
