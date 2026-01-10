import { authFirstRequireAccount, noAuth } from "./util";

export type HostStatus =
  | "active"
  | "deprovisioned"
  | "off"
  | "error"
  | "starting"
  | "restarting"
  | "running"
  | "stopping";

export interface HostMachine {
  cloud?: string; // e.g., gcp, hyperstack, lambda, nebius, self-host, local
  machine_type?: string; // e.g., n2-standard-4, custom specs
  gpu_type?: string;
  gpu_count?: number;
  storage_mode?: "ephemeral" | "persistent";
  disk_gb?: number;
  disk_type?: "ssd" | "balanced" | "standard" | "ssd_io_m3";
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

export interface HostCatalogEntry {
  kind: string;
  scope: string;
  payload: any;
}

export interface HostProviderCapabilities {
  supportsStop: boolean;
  supportsRestart?: boolean;
  supportsHardRestart?: boolean;
  supportsDiskType: boolean;
  supportsDiskResize: boolean;
  diskResizeRequiresStop?: boolean;
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
  entries: HostCatalogEntry[];
  provider_capabilities?: Record<string, HostProviderCapabilities>;
}

export interface Host {
  id: string;
  name: string;
  owner: string; // account_id
  region: string;
  size: string; // ui preset label/key
  gpu: boolean;
  status: HostStatus;
  reprovision_required?: boolean;
  version?: string;
  project_bundle_version?: string;
  tools_version?: string;
  machine?: HostMachine;
  public_ip?: string;
  last_error?: string;
  last_error_at?: string;
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
  deleted?: string;
}

export interface HostLogEntry {
  id: string;
  vm_id: string;
  ts?: string | null;
  action: string;
  status: string;
  provider?: string | null;
  spec?: Record<string, any> | null;
  error?: string | null;
}

export type HostSoftwareArtifact =
  | "project-host"
  | "project"
  | "project-bundle"
  | "tools";

export type HostSoftwareChannel = "latest" | "staging";

export interface HostSoftwareUpgradeTarget {
  artifact: HostSoftwareArtifact;
  channel?: HostSoftwareChannel;
  version?: string;
}

export interface HostSoftwareUpgradeRequest {
  id: string;
  targets: HostSoftwareUpgradeTarget[];
  base_url?: string;
}

export interface HostSoftwareUpgradeResponse {
  results: Array<{
    artifact: HostSoftwareArtifact;
    version: string;
    status: "updated" | "noop";
  }>;
}

export const hosts = {
  listHosts: authFirstRequireAccount,
  getCatalog: authFirstRequireAccount,
  updateCloudCatalog: authFirstRequireAccount,
  getHostLog: authFirstRequireAccount,
  createHost: authFirstRequireAccount,
  startHost: authFirstRequireAccount,
  stopHost: authFirstRequireAccount,
  restartHost: authFirstRequireAccount,
  forceDeprovisionHost: authFirstRequireAccount,
  removeSelfHostConnector: authFirstRequireAccount,
  renameHost: authFirstRequireAccount,
  updateHostMachine: authFirstRequireAccount,
  deleteHost: authFirstRequireAccount,
  upgradeHostSoftware: authFirstRequireAccount,
  getBackupConfig: noAuth,
};

export interface Hosts {
  listHosts: (opts: {
    account_id?: string;
    admin_view?: boolean;
    include_deleted?: boolean;
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
  restartHost: (opts: {
    account_id?: string;
    id: string;
    mode?: "reboot" | "hard";
  }) => Promise<Host>;
  forceDeprovisionHost: (opts: { account_id?: string; id: string }) => Promise<void>;
  removeSelfHostConnector: (opts: { account_id?: string; id: string }) => Promise<void>;
  renameHost: (opts: {
    account_id?: string;
    id: string;
    name: string;
  }) => Promise<Host>;
  updateHostMachine: (opts: {
    account_id?: string;
    id: string;
    cloud?: HostMachine["cloud"];
    cpu?: number;
    ram_gb?: number;
    disk_gb?: number;
    disk_type?: HostMachine["disk_type"];
    machine_type?: HostMachine["machine_type"];
    gpu_type?: HostMachine["gpu_type"];
    gpu_count?: number;
    storage_mode?: HostMachine["storage_mode"];
    boot_disk_gb?: number;
    region?: string;
    zone?: string;
  }) => Promise<Host>;
  upgradeHostSoftware: (opts: {
    account_id?: string;
    id: string;
    targets: HostSoftwareUpgradeTarget[];
    base_url?: string;
  }) => Promise<HostSoftwareUpgradeResponse>;
  deleteHost: (opts: { account_id?: string; id: string }) => Promise<void>;
}
