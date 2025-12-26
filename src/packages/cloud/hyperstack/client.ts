/*
Hyperstack API client.

This tries as much as possible to just provide a Node.js Typescript
upstream API to access

https://infrahub-doc.nexgencloud.com/docs/api-reference/

There should be nothing CoCalc specific here.  Put that
in other files.
*/

import axios from "axios";
import type { AxiosInstance } from "axios";
import getLogger from "@cocalc/backend/logger";
import type {
  Region,
  FlavorRegionData,
  Stock,
  Environment,
  KeyPair,
  Image,
  SecurityRule,
  VirtualMachine,
  RegionInfo,
  UsageCostHistory,
  LastDayCost,
  CreditInfo,
  PaymentDetails,
  Price,
  FirewallRule,
  Firewall,
  FirewallRuleDesc,
  VolumeType,
  VolumeDetails,
} from "@cocalc/util/compute/cloud/hyperstack/api-types";
import { SECURITY_RULE_DEFAULTS } from "@cocalc/util/compute/cloud/hyperstack/api-types";
import type { Cache } from "./cache";
import { getHyperstackConfig } from "./config";

const log = getLogger("hyperstack:client");

const clientCache: Record<string, AxiosInstance> = {};

// see https://infrahub-doc.nexgencloud.com/docs/api-reference/
const apiBaseUrl = "https://infrahub-api.nexgencloud.com/v1";

export default async function getClient(): Promise<any> {
  const { apiKey } = getHyperstackConfig();
  if (!apiKey) {
    log.warn("requested Hyperstack api key, but it's not configured");
    throw Error("Hyperstack not configured");
  }
  if (clientCache[apiKey]) {
    return clientCache[apiKey];
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

let globalCache: Cache | null = null;
export function initCache(cache: Cache) {
  globalCache = cache;
}

function clearCache(key) {
  if (globalCache == null) {
    return;
  }
  globalCache.delete(key);
}

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
  const key = { method, url, params };
  log.debug("call ", { cache, globalCache });
  if (cache != null && globalCache != null) {
    if (!cache) {
      log.debug("call: explicitly remove from cache");
      await globalCache.delete(key);
    } else {
      if (await globalCache.has(key)) {
        log.debug("call: get value from cache");
        return await globalCache.get(key);
      } else {
        log.debug("call: value not in cache");
      }
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
    // console.log(resp);
    const { data } = resp;
    if (data?.status === false) {
      throw Error(
        `error calling Hyperstack api ${url} -- ${JSON.stringify({
          params,
          data,
        })}`,
      );
    }
    if (cache && globalCache != null) {
      await globalCache.set(key, data);
    }
    return data;
  } catch (err) {
    // No need to log this because the error is raised.
    // Often API errors are intentional as well, e.g., checking
    // if a VM exists, and logging them with ERROR is improperly
    // alarming when looking at log.
    // log.debug("ERROR - ", err);
    if (err?.response?.data?.message) {
      if (Object.keys(err.response.data).length == 1) {
        throw Error(err.response.data.message);
      } else {
        throw Error(JSON.stringify(err.response.data));
      }
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

// Flavors

export async function getFlavors(cache = true): Promise<FlavorRegionData[]> {
  const { data } = await call({
    method: "get",
    url: "core/flavors",
    cache,
  });
  return data;
}

export async function getRegions(cache = true): Promise<RegionInfo[]> {
  const { regions } = await call({
    method: "get",
    url: "core/regions",
    cache,
  });
  return regions;
}

export async function getStocks(cache = true): Promise<Stock[]> {
  const { stocks } = await call({
    method: "get",
    url: "core/stocks",
    cache,
  });
  return stocks;
}

// Environments

export async function getEnvironments(cache = true): Promise<Environment[]> {
  const { environments } = await call({
    method: "get",
    url: "core/environments",
    cache,
  });
  return environments;
}

export async function deleteEnvironment(id: number): Promise<Environment[]> {
  await call({ method: "delete", url: `/core/environments/${id}` });
  return await getEnvironments(false);
}

export async function createEnvironment(params: {
  name: string;
  region: Region;
}): Promise<Environment[]> {
  await call({ method: "post", url: "/core/environments", params });
  return await getEnvironments(false);
}

// Key Pairs

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
  clearCache({
    method: "get",
    url: "/core/keypairs",
  });
  return keypair;
}

// Images

export async function getImages(
  cache = true,
  // NOTE: specify the region parameter doesn't work
  params: { region?: Region } = {},
): Promise<Image[]> {
  // the api docs incorrectly say this is "data" not "images"
  // https://infrahub-doc.nexgencloud.com/docs/api-reference/core-resources/images
  const { images } = await call({
    method: "get",
    url: "/core/images",
    params,
    cache,
  });
  return images;
}

// VMs

export async function createVirtualMachines(params: {
  name: string;
  environment_name: string;
  image_name?: string;
  volume_name?: string;
  flavor_name: string;
  key_name: string;
  count?: number;
  security_rules?: SecurityRule[];
  assign_floating_ip?: boolean;
  create_bootable_volume?: boolean;
  user_data?: string;
  callback_url?: string;
  profile?: {
    name: string;
    description: string;
  };
  labels?: string[];
}) {
  // TODO/Worry -- params.user_data could contain an api_key, which shouldn't be logged...
  log.debug("createVirtualMachines", params);
  if (!params.count) {
    params.count = 1;
  }
  if (params.security_rules != null) {
    const security_rules: SecurityRule[] = [];
    for (const rule of params.security_rules) {
      security_rules.push({ ...SECURITY_RULE_DEFAULTS, ...rule });
    }
    params = { ...params, security_rules };
  }
  const { instances } = await call({
    method: "post",
    url: "core/virtual-machines",
    params,
  });
  return instances;
}

export async function getVirtualMachines(): Promise<VirtualMachine[]> {
  const { instances } = await call({
    method: "get",
    url: "/core/virtual-machines",
  });
  return instances;
}

export async function getVirtualMachine(id: number): Promise<VirtualMachine> {
  if (!id) {
    throw Error("id must be defined");
  }
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

// You can only resize a virtual machine when the status
// is ACTIVE, SHUTOFF.  I think it has to be stopped but
// not hibernated.
// You can't change GPU.
// Also as of April 1, 2024, it doesn't work, just erroring
// after a few minutes -- the docs say "coming soon", so that's
// not surprising that it doesn't work!
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

export async function attachPublicIP(id: number) {
  await call({
    method: "post",
    url: `/core/virtual-machines/${id}/attach-floatingip`,
  });
}
export async function detachPublicIP(id: number) {
  await call({
    method: "post",
    url: `/core/virtual-machines/${id}/detach-floatingip`,
  });
}

// This getMetrics always fails with status 400
// in my tests, and I have no idea why.
// In the frontend in all states it says:
//  "Virtual Machine needs to be in a valid state to view metrics"
// so my guess is that this isn't implemented.
export async function getVirtualMachineMetrics(
  id,
  duration:
    | "1h"
    | "2h"
    | "4h"
    | "6h"
    | "12h"
    | "1d"
    | "3d"
    | "7d"
    | "15"
    | "30d" = "1h",
) {
  return await call({
    method: "get",
    url: `/core/virtual-machines/${id}/metrics?duration=${duration}`,
  });
}

// docs at https://infrahub-doc.nexgencloud.com/docs/api-reference/core-resources/virtual-machines/retrieve-events-history are wrong, saying this returns virtual_machine_events
export async function getVirtualMachineEvents(id) {
  const { instance_events } = await call({
    method: "get",
    url: `/core/virtual-machines/${id}/events`,
  });
  return instance_events;
}

export async function attachVirtualMachineCallback({
  id,
  url,
}: {
  id: number;
  url: string;
}) {
  await call({
    method: "post",
    url: `core/virtual-machines/${id}/attach-callback`,
    params: { url },
  });
}

export async function updateVirtualMachineCallback({
  id,
  url,
}: {
  id: number;
  url: string;
}) {
  await call({
    method: "put",
    url: `core/virtual-machines/${id}/update-callback`,
    params: { url },
  });
}

export async function deleteVirtualMachineCallback({ id }: { id: number }) {
  await call({
    method: "delete",
    url: `core/virtual-machines/${id}/update-callback`,
  });
}

// MONEY

// This returns 'alive' and works if things are good; if not, something bad happens.
export async function confirmBillingStatus(): Promise<"alive"> {
  const { message } = await call({
    method: "get",
    url: "/billing/alive",
  });
  return message;
}

export async function getUsageCostHistory(): Promise<UsageCostHistory[]> {
  const { data } = await call({
    method: "get",
    url: "/billing/billing/usage",
  });
  return data;
}

export async function getLastDayCost(): Promise<LastDayCost> {
  const { data } = await call({
    method: "get",
    url: "/billing/billing/last-day-cost",
  });
  return data;
}

export async function getCredit(): Promise<CreditInfo> {
  const { data } = await call({
    method: "get",
    url: "/billing/user-credit/credit",
  });
  return data;
}

export async function getPaymentHistory(): Promise<PaymentDetails[]> {
  const { data } = await call({
    method: "get",
    url: "/billing/payment/payment-details",
  });
  return data;
}

// TODO: this seems "half implemented" on the hyperstack side...
export async function createPayment(amount): Promise<string> {
  const { data } = await call({
    method: "post",
    url: "/billing/payment/payment-initiate",
    params: { amount },
  });
  return data.payment_id;
}

export async function getPricebook(cache = true): Promise<Price[]> {
  const x = await call({
    method: "get",
    url: "/pricebook",
    cache,
  });
  return x;
}

///////////////////////////////////////////////
// Firewalls

export async function getFirewalls(): Promise<Firewall[]> {
  const { firewalls } = await call({
    method: "get",
    url: "/core/firewalls",
  });
  return firewalls;
}

export async function getFirewall(id: number): Promise<Firewall> {
  const { firewall } = await call({
    method: "get",
    url: `/core/firewalls/${id}`,
  });
  return firewall;
}

export async function createFirewall(params: {
  name: string;
  environment_id: number;
  description?: string;
}): Promise<Firewall> {
  const { firewall } = await call({
    method: "post",
    url: "/core/firewalls",
    params,
  });
  return firewall;
}

export async function deleteFirewall(id: number): Promise<void> {
  await call({
    method: "delete",
    url: `/core/firewalls/${id}`,
  });
}

// array of protocols, including 'tcp', 'udp', etc.
export async function getFirewallProtocols(): Promise<string[]> {
  const { protocols } = await call({
    method: "get",
    url: "/core/sg-rules-protocols",
  });
  return protocols;
}

// Basically this allows you to open a range of ports.
export async function addFirewallRule(
  params:
    | ({
        virtual_machine_id: number;
      } & FirewallRuleDesc)
    | ({ firewall_id: number } & FirewallRuleDesc),
): Promise<FirewallRule> {
  // defaults
  params = {
    direction: "ingress",
    protocol: "tcp",
    ethertype: "IPv4",
    remote_ip_prefix: "0.0.0.0/0",
    ...params,
  };
  let resp;
  if (params["virtual_machine_id"]) {
    const id = params["virtual_machine_id"];
    delete params["virtual_machine_id"];
    resp = await call({
      method: "post",
      url: `core/virtual-machines/${id}/sg-rules`,
      params,
    });
  } else if (params["firewall_id"]) {
    const id = params["firewall_id"];
    delete params["firewall_id"];
    resp = await call({
      method: "post",
      url: `core/firewalls/${id}/firewall-rules`,
      params,
    });
  } else {
    throw Error("virtual_machine_id or firewall_id must be specified");
  }
  const { security_rule } = resp;
  return security_rule;
}

export async function deleteFirewallRule(
  params:
    | {
        virtual_machine_id: number;
        sg_rule_id: number;
      }
    | { firewall_id: number; firewall_rule_id: number },
) {
  const { virtual_machine_id, sg_rule_id, firewall_id, firewall_rule_id } =
    (params as any) ?? {};
  if (virtual_machine_id) {
    await call({
      method: "delete",
      url: `/core/virtual-machines/${virtual_machine_id}/sg-rules/${sg_rule_id}`,
    });
  } else if (firewall_id) {
    await call({
      method: "delete",
      url: `/core/firewalls/${firewall_id}/firewall-rules/${firewall_rule_id}`,
    });
  } else {
    throw Error("virtual_machine_id or firewall_id must be specified");
  }
}

// This sets *exactly* which VM's this firewall is attached to.
// It doesn't just add it to some VM's.  This this is very dangerous
// to use, due to the possibility of a race condition -- if twice at once,
// running code reads the vms, then adds one, then writes the vms back,
// then one vm will not get the firewall and the other will!  So don't
// use this without some sort of lock...
export async function setFirewallVirtualMachines({
  firewall_id,
  vms,
}: {
  firewall_id: number;
  vms: number[]; // the exact list of vm's the firewall will be attached to.
}) {
  await call({
    method: "post",
    url: `/core/firewalls/${firewall_id}/update-attachments`,
    params: { vms },
  });
}

// VOLUMES

export async function getVolumeTypes(cache = true): Promise<VolumeType[]> {
  const { volume_types } = await call({
    method: "get",
    url: "core/volume-types",
    cache,
  });
  return volume_types;
}

export async function getVolumes(cache = true): Promise<VolumeDetails[]> {
  const { volumes } = await call({
    method: "get",
    url: "core/volumes",
    cache,
  });
  return volumes;
}

export async function createVolume(params: {
  name: string;
  size: number; // in GB
  environment_name: string;
  // volume_type defaults to "Cloud-SSD", which is the only option right now
  volume_type?: VolumeType;
  description?: string;
  image_id?: number;
}) {
  params = { volume_type: "Cloud-SSD", description: "", ...params };
  clearCache({
    method: "get",
    url: "core/volumes",
  });
  const { volume } = await call({
    method: "post",
    url: "core/volumes",
    params,
  });
  clearCache({
    method: "get",
    url: "core/volumes",
  });
  return volume;
}

export async function deleteVolume(id: number) {
  await call({ method: "delete", url: `/core/volumes/${id}` });
  clearCache({
    method: "get",
    url: "core/volumes",
  });
}

export async function attachVolume({
  virtual_machine_id,
  volume_ids,
}: {
  virtual_machine_id: number;
  volume_ids: number[];
}) {
  const { volume_attachments } = await call({
    method: "post",
    url: `core/virtual-machines/${virtual_machine_id}/attach-volumes`,
    params: { volume_ids },
  });
  return volume_attachments;
}

export async function detachVolume({
  virtual_machine_id,
  volume_ids,
}: {
  virtual_machine_id: number;
  volume_ids: number[];
}) {
  const { volume_attachments } = await call({
    method: "post",
    url: `core/virtual-machines/${virtual_machine_id}/detach-volumes`,
    params: { volume_ids },
  });
  return volume_attachments;
}
