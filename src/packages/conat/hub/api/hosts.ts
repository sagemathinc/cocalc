import { authFirstRequireAccount } from "./util";

export type HostStatus =
  | "deprovisioned"
  | "off"
  | "starting"
  | "running"
  | "stopping";

export interface HostMachine {
  cloud?: string; // e.g., gcp, aws, hyperstack, local
  machine_type?: string; // e.g., n2-standard-4, custom specs
  gpu_type?: string;
  gpu_count?: number;
  disk_gb?: number;
  metadata?: Record<string, any>;
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
  projects?: number;
  last_seen?: string;
  tier?: "free" | "member" | "pro";
  scope?: "owned" | "collab" | "shared" | "pool";
  can_start?: boolean;
  can_place?: boolean;
  reason_unavailable?: string;
}

export const hosts = {
  listHosts: authFirstRequireAccount,
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
