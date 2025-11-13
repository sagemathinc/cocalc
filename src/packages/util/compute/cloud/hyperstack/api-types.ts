/*
Typings used for the Hyperstack client API.

Using these helps impose clarity and sanity wherever we use the hyperstack api
or data that comes out of it.
*/

export type Region = "CANADA-1" | "NORWAY-1";
export const REGIONS = ["CANADA-1", "NORWAY-1"] as const;
export const DEFAULT_REGION = REGIONS[0];
export const DEFAULT_FLAVOR = "n3-A100x1";
export const DEFAULT_DISK = 50;

// each time, must increase disk by at least this amount.
export const MIN_DISK_INCREASE_GB = 25;
// that's what they told me.
export const MAX_DISKS = 26;

export interface RegionInfo {
  id: number;
  name: Region;
  description?: string;
}

export interface FlavorData {
  id: number;
  name: string;
  region_name: Region;
  cpu: number;
  ram: number;
  disk: number;
  ephemeral: number;
  gpu: string;
  gpu_count: number;
  stock_available: boolean;
  created_at: string;
}

export interface FlavorRegionData {
  gpu: string;
  region_name: string;
  flavors: FlavorData[];
}

export type Availability =
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

export interface ModelInfo {
  model: string;
  available: Availability;
  planned_7_days: Availability | null;
  planned_30_days: Availability | null;
  planned_100_days: Availability | null;
  configurations: {
    "1x": number;
    "2x": number;
    "4x": number;
    "8x": number;
    "10x": number;
  };
}

export interface Stock {
  region: Region;
  "stock-type": "GPU";
  models: ModelInfo[];
}

export interface Environment {
  id: number;
  name: string;
  region: Region;
  created_at: string;
}

export interface KeyPair {
  id: number;
  name: string;
  environment: string;
  public_key: string;
  fingerprint: string;
  created_at: string;
}

export interface Image {
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

export interface Volume {
  id: number;
  name: string;
  description: string;
  volume_type: string;
  size: number;
}

export interface VolumeAttachment {
  volume: Volume;
  status: string;
  device: string;
  created_at: string;
}

// for defaults, see below.
export interface SecurityRule {
  direction?: "ingress" | "egress";
  protocol?: Protocol;
  port_range_min: number;
  port_range_max: number;
  ethertype?: Ethertype;
  remote_ip_prefix?: string;
  status?: string;
  id?: number;
  created_at?: string;
}

export const SECURITY_RULE_DEFAULTS: Partial<SecurityRule> = {
  direction: "ingress",
  protocol: "tcp",
  ethertype: "IPv4",
  remote_ip_prefix: "0.0.0.0/0", //  = everything
};

// ACTIVE = when its running
// HIBERNATING = when it is being hibernated
// HIBERNATED = when it is done hibernating
// SHUTOFF = ?
// RESETORING = when it is being switchd from hibernating to active

export type VmStatus =
  | "ACTIVE"
  | "HIBERNATING"
  | "HIBERNATED"
  | "SHUTOFF"
  | "RESTORING";

export type PowerState = "RUNNING" | "SHUTDOWN";

export type VmState = "active" | "shelved_offloaded" | "stopped";

export interface VirtualMachine {
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

export interface UsageCostHistory {
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

export interface LastDayCost {
  instances_cost: number;
  volumes_cost: number;
  clusters_cost: number;
  total_cost: number;
}

export interface CreditInfo {
  // current credit balance in dollars
  credit: number;
  // The balance at which resource access will be suspended
  threshold: number;
  can_create_instance: boolean;
}

export interface PaymentDetails {
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

export interface Price {
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

export type Protocol =
  | "any"
  | "ah"
  | "dccp"
  | "egp"
  | "esp"
  | "gre"
  | "hopopt"
  | "icmp"
  | "igmp"
  | "ip"
  | "ipip"
  | "ipv6-encap"
  | "ipv6-frag"
  | "ipv6-icmp"
  | "icmpv6"
  | "ipv6-nonxt"
  | "ipv6-opts"
  | "ipv6-route"
  | "ospf"
  | "pgm"
  | "rsvp"
  | "sctp"
  | "tcp"
  | "udp"
  | "udplite"
  | "vrrp";

type Ethertype = "IPv4" | "IPv6";

export interface FirewallRule {
  virtual_machine_id: number; // virtual machine id
  port_range_min: number;
  port_range_max: number;
  direction?: "ingress" | "egress";
  protocol?: Protocol;
  ethertype?: Ethertype;
  remote_ip_prefix?: string;
  status: "SUCCESS"; // todo
  created_at: string;
}

export interface FirewallAttachment {
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

export interface Firewall {
  id: number;
  name: string;
  description: string;
  environment: Environment;
  status: "SUCCESS"; // todo
  created_at: string;
  rules: FirewallRule[];
  attachments: FirewallAttachment[];
}

export interface FirewallRuleDesc {
  port_range_min: number;
  port_range_max: number;
  direction?: "ingress" | "egress";
  protocol?: Protocol;
  ethertype?: Ethertype;
  remote_ip_prefix?: string;
}

export type VolumeType = "Cloud-SSD";

export interface VolumeDetails {
  id: number;
  name: string;
  environment: {
    name: string;
  };
  description: string;
  volume_type: string;
  size: number;
  status: string;
  bootable: boolean;
  image_id: number;
  callback_url: string;
  created_at: string;
  updated_at: string;
}
