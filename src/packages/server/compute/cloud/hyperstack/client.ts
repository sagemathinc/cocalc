/*
Get Hyperstack API client.

NOTE: Their API is WEIRDLY SLOW, so we implement a caching layer in front of
their API so we can write code that doesn't have to work around an insanely
slow API.  We cache data in memory (not our database), since for sanity
we put run code for interacting with a cloud API in a single nodejs process
even in our big Kubernetes deploys.
*/

import axios from "axios";
import type { AxiosInstance } from "axios";
import getLogger from "@cocalc/backend/logger";
import { getServerSettings } from "@cocalc/database/settings/server-settings";
import TTLCache from "@isaacs/ttlcache";

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
      "Content-Type": "application/json",
      api_key: apiKey,
    },
  });
  clientCache[apiKey] = client;
  return client;
}

const ttlCache = new TTLCache({ ttl: 30 * 60 * 1000 });

async function call({
  method,
  url,
  params,
  cache,
}: {
  method: "get" | "post" | "delete" | "put";
  url: string;
  params?: object;
  cache?: boolean;
}) {
  let key = "";
  if (cache) {
    key = JSON.stringify({ method, url, params });
    if (ttlCache.has(key)) {
      return ttlCache.get(key);
    }
  }
  log.debug("call", { method, url, params });
  const t = Date.now();
  try {
    const client = await getClient();
    let resp;
    if (method == "get") {
      resp = await client.get(url, params);
    } else if (method == "post") {
      resp = await client.post(url, params);
    } else if (method == "put") {
      resp = await client.put(url, params);
    } else if (method == "delete") {
      resp = await client.delete(url, params);
    } else {
      throw Error(`unsupported method: ${method}`);
    }
    //console.log(resp);
    const { data } = resp;
    if (!data?.status) {
      throw Error(
        `error calling Hyperstack api ${url} -- ${data?.message} -- ${JSON.stringify(
          params,
        )}`,
      );
    }
    if (cache) {
      ttlCache.set(key, data);
    }
    return data;
  } finally {
    log.debug(`call TOOK ${(Date.now() - t) / 1000} seconds`, {
      method,
      url,
      params,
    });
  }
}

type Region = "CANADA-1" | "NORWAY-1";

// Flavors

interface Flavor {
  gpu: string;
  region_name: string;
  flavors: {
    id: number;
    name: string;
    region_name: Region;
    cpu: number;
    ram: number;
    disk: number;
    gpu: string;
    gpu_count: number;
    stock_available: boolean;
    created_at: string;
  };
}

export async function getFlavors(): Promise<Flavor[]> {
  const { data } = await call({
    method: "get",
    url: "core/flavors",
    cache: true,
  });
  return data;
}

// Environments

interface Environment {
  id: number;
  name: string;
  region: Region;
  created_at: string;
}

export async function getEnvironments(): Promise<Environment[]> {
  const { environments } = await call({
    method: "get",
    url: "core/environments",
  });
  return environments;
}

export async function deleteEnvironment(id: number) {
  await call({ method: "delete", url: `/core/environments/${id}` });
}

export async function createEnvironment(params: {
  name: string;
  region: Region;
}) {
  await call({ method: "post", url: "/core/environments", params });
}

// Images

interface Image {
  region_name: Region;
  type: string;
  logo: string;
  images: {
    id: number;
    name: string;
    size: number;
    region_name: string;
    display_size: string;
    typ: string;
    version: string;
  }[];
}

export async function getImages(
  params: { region?: Region } = {},
): Promise<Image[]> {
  // the api docs incorrectly say this is "data" not "images"
  // https://infrahub-doc.nexgencloud.com/docs/api-reference/core-resources/images
  const { images } = await call({
    method: "get",
    url: "/core/images",
    params,
    cache: true,
  });
  return images;
}

// VMs

export async function createVirtualMachines(params: {
  name: string;
  environment_name: string;
  image_name: string;
  flavor_name: string;
  key_name: string;
  count: number;
}) {
  log.debug("createVirtualMachines", params);
  const { instances } = await call({
    method: "post",
    url: "core/virtual-machines",
    params,
  });
  return instances;
}
