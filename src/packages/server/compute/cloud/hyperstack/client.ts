/*
Hyperstack API client.

This tries as much as possible to just provide a Node.js Typescript
upstream API to access

https://infrahub-doc.nexgencloud.com/docs/api-reference/

There should be nothing CoCalc specific here.  Put that
in other files.

TODO: maybe the small amount of caching below should be removed.
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
    if (cache) {
      ttlCache.set(key, data);
    }
    return data;
  } catch (err) {
    log.debug("ERROR - ", err);
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

export async function getFlavors(cache = true): Promise<Flavor[]> {
  const { data } = await call({
    method: "get",
    url: "core/flavors",
    cache,
  });
  return data;
}

export async function getRegions(cache = true): Promise<Flavor[]> {
  const { regions } = await call({
    method: "get",
    url: "core/regions",
    cache,
  });
  return regions;
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
  // update cache to have new key in it
  await getKeyPairs(false);
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
  cache = true,
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
  image_name: string;
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

// ACTIVE = when its running
// HIBERNATING = when it is being hibernated
// HIBERNATED = when it is done hibernating
// SHUTOFF = ?
// RESETORING = when it is being switchd from hibernating to active

type VmStatus =
  | "ACTIVE"
  | "HIBERNATING"
  | "HIBERNATED"
  | "SHUTOFF"
  | "RESTORING";

type PowerState = "RUNNING" | "SHUTDOWN";

type VmState = "active" | "shelved_offloaded" | "stopped";

interface VirtualMachine {
  id: number;
  name: string;
  status: VmStatus;
  power_state: PowerState;
  vm_state: VmState;
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

interface UsageCostHistory {
  resource_id: number;
  resource_type: "vm" | "volume";
  name: string;
  organization_id: number;
  bill_per_minute: number | null;
  create_time: string;
  terminate_time: string;
  total_up_time: number; // up time in *minutes*
  total_bill: number;
  active: boolean;
  exclude_billing: boolean;
}

export async function getUsageCostHistory(): Promise<UsageCostHistory[]> {
  const { data } = await call({
    method: "get",
    url: "/billing/billing/usage",
  });
  return data;
}

interface LastDayCost {
  instances_cost: number;
  volumes_cost: number;
  clusters_cost: number;
  total_cost: number;
}

export async function getLastDayCost(): Promise<LastDayCost> {
  const { data } = await call({
    method: "get",
    url: "/billing/billing/last-day-cost",
  });
  return data;
}

interface CreditInfo {
  // current credit balance in dollars
  credit: number;
  // The balance at which resource access will be suspended
  threshold: number;
  can_create_instance: boolean;
}

export async function getCredit(): Promise<CreditInfo> {
  const { data } = await call({
    method: "get",
    url: "/billing/user-credit/credit",
  });
  return data;
}

interface PaymentDetails {
  amount: number;
  currency: string; // e.g., 'usd'
  paid_from: string; // e.g., "William Stein"
  status: string; // e.g., "complete".  "payment_initiated" means successful (?)
  gateway_response: string | null;
  description: string | null;
  transaction_id: string;
  payment_id: string;
  updated_at: string;
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

interface Price {
  id: number;
  name: string;
  value: string;
  // original_value = price before discounts
  original_value: string;
  // true if a discount applied
  discount_applied: boolean;
  start_time: string | null;
  end_time: string | null;
}
export async function getPricebook(cache=true): Promise<Price[]> {
  const x = await call({
    method: "get",
    url: "/pricebook",
    cache,
  });
  return x;
}

///////////////////////////////////////////////
// Firewalls

interface FirewallRule {
  virtual_machine_id: number; // virtual machine id
  port_range_min: number;
  port_range_max: number;
  direction?: "ingress" | "egress";
  protocol?: string;
  ethertype?: "IPv4" | "IPv6";
  remote_ip_prefix?: string;
  status: "SUCCESS"; // todo
  created_at: string;
}

interface FirewallAttachment {
  id: number;
  status: "SUCCESS";
  vm: {
    id: number;
    name: string;
    flavor: string;
    environment: string;
    status: VmStatus;
    created_at: string;
  };
  created_at: string;
}

interface Firewall {
  id: number;
  name: string;
  description: string;
  environment: Environment;
  status: "SUCCESS"; // todo
  created_at: string;
  rules: FirewallRule[];
  attachments: FirewallAttachment[];
}

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

interface FirewallRuleDesc {
  port_range_min: number;
  port_range_max: number;
  direction?: "ingress" | "egress";
  protocol?: string;
  ethertype?: "IPv4" | "IPv6";
  remote_ip_prefix?: string;
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

type VolumeType = "Cloud-SSD";
export async function getVolumeTypes(cache=true): Promise<VolumeType[]> {
  const { volume_types } = await call({
    method: "get",
    url: "core/volume-types",
    cache,
  });
  return volume_types;
}

interface VolumeDetails {
  id: number;
  name: string;
  environment: {
    name: string;
  };
  description: string;
  volume_type: string;
  size: string;
  status: string;
  bootable: boolean;
  image_id: number;
  callback_url: string;
  created_at: string;
  updated_at: string;
}

export async function getVolumes(): Promise<VolumeDetails[]> {
  const { volumes } = await call({
    method: "get",
    url: "core/volumes",
  });
  return volumes;
}

export async function createVolume(params: {
  name: string;
  size: number; // in GB
  environment_name: string;
  volume_type?: VolumeType;
  description?: string;
  image_id?: number;
}) {
  params = { volume_type: "Cloud-SSD", ...params };
  const { volume } = await call({
    method: "post",
    url: "core/volumes",
    params,
  });
  return volume;
}

export async function deleteVolume(id: number) {
  await call({ method: "delete", url: `/core/volumes/${id}` });
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
