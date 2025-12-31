import { authFirstRequireAccount, noAuth } from "./util";

export type HostStatus =
  | "deprovisioned"
  | "off"
  | "error"
  | "starting"
  | "running"
  | "stopping";

export interface HostMachine {
  cloud?: string; // e.g., gcp, aws, hyperstack, local
  machine_type?: string; // e.g., n2-standard-4, custom specs
  gpu_type?: string;
  gpu_count?: number;
  storage_mode?: "ephemeral" | "persistent";
  disk_gb?: number;
  disk_type?: "ssd" | "balanced" | "standard";
  zone?: string;
  source_image?: string;
  bootstrap_url?: string;
  startup_script?: string;
  metadata?: Record<string, any>;
}

export interface HostCatalogRegion {
  name: string;
  status?: string | null;
  zones: string[];
}

export interface HostCatalogZone {
  name: string;
  status?: string | null;
  region?: string | null;
  location?: string | null;
  lowC02?: boolean | null;
}

export interface HostCatalogMachineType {
  name?: string | null;
  guestCpus?: number | null;
  memoryMb?: number | null;
  isSharedCpu?: boolean | null;
  deprecated?: any;
}

export interface HostCatalogGpuType {
  name?: string | null;
  maximumCardsPerInstance?: number | null;
  description?: string | null;
  deprecated?: any;
}

export interface HostProviderCapabilities {
  supportsStop: boolean;
  supportsDiskType: boolean;
  supportsDiskResize: boolean;
  supportsCustomImage: boolean;
  supportsGpu: boolean;
  supportsZones: boolean;
  persistentStorage: {
    supported: boolean;
    growable: boolean;
  };
  hasRegions?: boolean;
  hasZones?: boolean;
  hasImages?: boolean;
  hasGpus?: boolean;
  supportsPersistentStorage?: boolean;
  supportsEphemeral?: boolean;
  supportsLocalDisk?: boolean;
  supportsGpuImages?: boolean;
  requiresRegion?: boolean;
  requiresZone?: boolean;
}

export interface HostCatalog {
  provider: string;
  regions: HostCatalogRegion[];
  zones: HostCatalogZone[];
  machine_types_by_zone: Record<string, HostCatalogMachineType[]>;
  gpu_types_by_zone: Record<string, HostCatalogGpuType[]>;
  provider_capabilities?: Record<string, HostProviderCapabilities>;
  images?: {
    project: string;
    name?: string | null;
    family?: string | null;
    selfLink?: string | null;
    architecture?: string | null;
    status?: string | null;
    deprecated?: any;
    diskSizeGb?: string | null;
    creationTimestamp?: string | null;
    gpuReady?: boolean;
  }[];
  hyperstack_regions?: {
    name: string;
    description?: string | null;
  }[];
  hyperstack_flavors?: {
    name: string;
    region_name: string;
    cpu: number;
    ram: number;
    gpu: string;
    gpu_count: number;
  }[];
  hyperstack_images?: {
    name: string;
    region_name: string;
    typ: string;
    version: string;
    size: number;
  }[];
  hyperstack_stocks?: {
    region: string;
    model: string;
    available: string;
  }[];
  lambda_regions?: {
    name: string;
  }[];
  lambda_instance_types?: {
    name: string;
    vcpus?: number | null;
    memory_gib?: number | null;
    gpus?: number | null;
    regions?: string[];
  }[];
  lambda_images?: {
    id: string;
    name?: string | null;
    family?: string | null;
    architecture?: string | null;
    region?: string | null;
  }[];
  nebius_regions?: {
    name: string;
  }[];
  nebius_instance_types?: {
    name: string;
    platform?: string | null;
    platform_label?: string | null;
    vcpus?: number | null;
    memory_gib?: number | null;
    gpus?: number | null;
    gpu_label?: string | null;
  }[];
  nebius_images?: {
    id: string;
    name?: string | null;
    family?: string | null;
    version?: string | null;
    architecture?: string | null;
    recommended_platforms?: string[];
  }[];
}

export interface Host {
  id: string;
  name: string;
  owner: string; // account_id
  region: string;
  size: string; // ui preset label/key
  gpu: boolean;
  status: HostStatus;
  machine?: HostMachine;
  public_ip?: string;
  error?: string;
  error_at?: string;
  projects?: number;
  last_seen?: string;
  tier?: number;
  scope?: "owned" | "collab" | "shared" | "pool";
  can_start?: boolean;
  can_place?: boolean;
  reason_unavailable?: string;
  last_action?: string;
  last_action_at?: string;
  last_action_status?: string;
  last_action_error?: string;
}

export interface HostLogEntry {
  id: string;
  vm_id: string;
  ts?: string | null;
  action: string;
  status: string;
  provider?: string | null;
  error?: string | null;
}

export const hosts = {
  listHosts: authFirstRequireAccount,
  getCatalog: authFirstRequireAccount,
  updateCloudCatalog: authFirstRequireAccount,
  getHostLog: authFirstRequireAccount,
  createHost: authFirstRequireAccount,
  startHost: authFirstRequireAccount,
  stopHost: authFirstRequireAccount,
  deleteHost: authFirstRequireAccount,
  getBackupConfig: noAuth,
};

export interface Hosts {
  listHosts: (opts: {
    account_id?: string;
    admin_view?: boolean;
    catalog?: boolean;
  }) => Promise<Host[]>;
  getCatalog: (opts: {
    account_id?: string;
    provider?: string;
  }) => Promise<HostCatalog>;
  updateCloudCatalog: (opts: {
    account_id?: string;
    provider?: string;
  }) => Promise<void>;
  getHostLog: (opts: {
    account_id?: string;
    id: string;
    limit?: number;
  }) => Promise<HostLogEntry[]>;
  getBackupConfig: (opts: {
    account_id?: string;
    host_id: string;
  }) => Promise<{ toml: string; ttl_seconds: number }>;
  createHost: (opts: {
    account_id?: string;
    name: string;
    region: string;
    size: string;
    gpu?: boolean;
    machine?: HostMachine;
  }) => Promise<Host>;
  startHost: (opts: { account_id?: string; id: string }) => Promise<Host>;
  stopHost: (opts: { account_id?: string; id: string }) => Promise<Host>;
  deleteHost: (opts: { account_id?: string; id: string }) => Promise<void>;
}
