/*
Get Hyperstack API client.
*/

import axios from "axios";
import type { AxiosInstance } from "axios";
import getLogger from "@cocalc/backend/logger";
import { getServerSettings } from "@cocalc/database/settings/server-settings";

const log = getLogger("hyperstack:client");

const clientCache: { [key: string]: AxiosInstance } = {};

// see https://infrahub-doc.nexgencloud.com/docs/api-reference/
const apiBaseUrl = "https://infrahub-api.nexgencloud.com/v1";

export default async function getClient(): Promise<any> {
  const { hyperstack_api_key: apiKey } = await getServerSettings();
  if (clientCache[apiKey]) {
    return clientCache[apiKey];
  }
  if (!apiKey) {
    log.warn("requested Hyperstack api key, but it's not configured");
    throw Error("Hyperstack not configured");
  }

  log.debug("creating Hyperstack client...");
  const client = axios.create({
    baseURL: apiBaseUrl,
    headers: {
      accept: "application/json",
      api_key: apiKey,
    },
  });
  clientCache[apiKey] = client;
  return client;
}

async function get(...args) {
  const client = await getClient();
  const { data } = await client.get(...args);
  if (data?.status == true) {
    return data.data;
  }
  throw Error(data?.message ?? "error making api call");
}

export async function flavors() {
  return await get("core/flavors");
}
