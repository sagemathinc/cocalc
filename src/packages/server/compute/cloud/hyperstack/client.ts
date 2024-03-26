/*
Get Hyperstack API client.
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

// NOTE: Their API can be SLOW, so we implement a caching layer in front of
// their API so we can write code that doesn't have to work around this.
// We cache data in memory (not our database), since for sanity
// we put run code for interacting with a cloud API in a single nodejs process
// even in our big Kubernetes deploys.  Only a few things are cached.

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
  cache?: boolean; // if explicitly true use cache; if explicitly false, clear cache
}) {
  let key = "";
  if (cache != null) {
    key = JSON.stringify({ method, url, params });
    if (!cache) {
      ttlCache.delete(key);
    } else if (ttlCache.has(key)) {
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
    if (data?.status === false) {
      throw Error(
        `error calling Hyperstack api ${url} -- ${JSON.stringify({
          params,
          data,
        })}`,
      );
    }
    if (cache) {
      ttlCache.set(key, data);
    }
    return data;
  } catch (err) {
    if (err?.response?.data?.message) {
      throw Error(err.response.data.message);
    } else {
      throw err;
    }
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

type Availability =
  | "0"
  | "1"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "10+"
  | "25+"
  | "100+"
  | "200+";

interface ModelInfo {
  model: string;
  available: Availability;
  planned_7_days: Availability | null;
  planned_30_days: Availability | null;
  planned_100_days: Availability | null;
  configuration: {
    "1x": number;
    "2x": number;
    "4x": number;
    "8x": number;
    "10x": number;
  };
}

interface Stock {
  region: Region;
  "stock-type": "GPU";
  models: ModelInfo[];
}

export async function getStocks(): Promise<Stock[]> {
  const { stocks } = await call({
    method: "get",
    url: "core/stocks",
  });
  return stocks;
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

// Key Pairs
interface KeyPair {
  id: number;
  name: string;
  environment: string;
  public_key: string;
  fingerprint: string;
  created_at: string;
}

export async function getKeyPairs(useCache = true): Promise<KeyPair[]> {
  const { keypairs } = await call({
    method: "get",
    url: "/core/keypairs",
    cache: useCache,
  });
  return keypairs;
}

export async function importKeyPair(params: {
  name: string;
  environment_name: string;
  public_key: string;
}): Promise<KeyPair> {
  const { keypair } = await call({
    method: "post",
    url: "/core/keypairs",
    params,
  });
  return keypair;
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
  count?: number;
}) {
  log.debug("createVirtualMachines", params);
  if (!params.count) {
    params.count = 1;
  }
  const { instances } = await call({
    method: "post",
    url: "core/virtual-machines",
    params,
  });
  return instances;
}

interface Volume {
  id: number;
  name: string;
  description: string;
  volume_type: string;
  size: number;
}

interface VolumeAttachment {
  volume: Volume;
  status: string;
  device: string;
  created_at: string;
}

interface SecurityRule {
  id: number;
  direction: string;
  protocol: string;
  port_range_min: number;
  port_range_max: number;
  ethertype: string;
  remote_ip_prefix: string;
  status: string;
  created_at: string;
}

interface VirtualMachine {
  id: number;
  name: string;
  status: string;
  environment: { name: string };
  image: { name: string };
  flavor: {
    id: number;
    name: string;
    cpu: number;
    ram: number;
    disk: number;
    gpu: string;
    gpu_count: number;
  };
  keypair: { name: string };
  volume_attachments: VolumeAttachment[];
  security_rules: SecurityRule[];
  power_state: string;
  vm_state: string;
  fixed_ip: string;
  floating_ip: string;
  floating_ip_status: string;
  created_at: string;
}

export async function getVirtualMachines(): Promise<VirtualMachine[]> {
  const { instances } = await call({
    method: "get",
    url: "/core/virtual-machines",
  });
  return instances;
}

export async function getVirtualMachine(id: number): Promise<VirtualMachine> {
  // note -- typo on https://infrahub-doc.nexgencloud.com/docs/api-reference/core-resources/virtual-machines/vm-core/retrieve-vm-details where it says
  // "instances" instead of "instance".
  const { instance } = await call({
    method: "get",
    url: `/core/virtual-machines/${id}`,
  });
  return instance;
}

export async function startVirtualMachine(id: number) {
  await call({ method: "get", url: `/core/virtual-machines/${id}/start` });
}

// NOTE: this is really part of restart cleanly, and costs full price!
export async function stopVirtualMachine(id: number) {
  await call({ method: "get", url: `/core/virtual-machines/${id}/stop` });
}

export async function hardRebootVirtualMachine(id: number) {
  await call({
    method: "get",
    url: `/core/virtual-machines/${id}/hard-reboot`,
  });
}

// NOTE: this is exactly what is "stop" VM on most clouds, but there are
// warnings it is slow (my guess -- it copies data off a local disk).
export async function hibernateVirtualMachine(id: number) {
  await call({
    method: "get",
    url: `/core/virtual-machines/${id}/hibernate`,
  });
}

export async function restoreHibernatedVirtualMachine(id: number) {
  await call({
    method: "get",
    url: `/core/virtual-machines/${id}/hibernate-restore`,
  });
}

export async function deleteVirtualMachine(id: number) {
  await call({
    method: "delete",
    url: `/core/virtual-machines/${id}`,
  });
}

export async function resizeVirtualMachine(id: number, flavor_name: string) {
  await call({
    method: "post",
    url: `/core/virtual-machines/${id}/resize`,
    params: { flavor_name },
  });
}

export async function updateVirtualMachineLabels(id: number, labels: string[]) {
  await call({
    method: "put",
    url: `/core/virtual-machines/${id}/label`,
    params: { labels },
  });
}
