import { authFirstRequireAccount } from "./util";

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

export interface HostCatalog {
  provider: string;
  regions: HostCatalogRegion[];
  zones: HostCatalogZone[];
  machine_types_by_zone: Record<string, HostCatalogMachineType[]>;
  gpu_types_by_zone: Record<string, HostCatalogGpuType[]>;
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
  error?: string;
  error_at?: string;
  projects?: number;
  last_seen?: string;
  tier?: number;
  scope?: "owned" | "collab" | "shared" | "pool";
  can_start?: boolean;
  can_place?: boolean;
  reason_unavailable?: string;
}

export const hosts = {
  listHosts: authFirstRequireAccount,
  getCatalog: authFirstRequireAccount,
  createHost: authFirstRequireAccount,
  startHost: authFirstRequireAccount,
  stopHost: authFirstRequireAccount,
  deleteHost: authFirstRequireAccount,
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
