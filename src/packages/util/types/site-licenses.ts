import { Upgrades } from "../upgrades/types";
import { DedicatedDisk, DedicatedVM } from "./dedicated";

export interface SiteLicenseQuota {
  ram?: number;
  dedicated_ram?: number;
  cpu?: number;
  dedicated_cpu?: number;
  disk?: number;
  always_running?: boolean;
  member?: boolean;
  user?: "academic" | "business";
  dedicated_vm?: DedicatedVM | boolean;
  dedicated_disk?: DedicatedDisk;
  // idle_timeouts came later:
  // 1. they don't mix, just like member/free and always_running does not mix
  // 2. we define the timeout spans indirectly, gives us a bit of room to modify this later on.
  idle_timeout?: "short" | "medium" | "day";
  boost?: boolean; // default false
}

// For typescript use of these from user side, we make this available:
export interface SiteLicense {
  id: string;
  title?: string;
  description?: string;
  info?: { [key: string]: any };
  expires?: Date;
  activates?: Date;
  created?: Date;
  last_used?: Date;
  managers?: string[];
  restricted?: boolean;
  upgrades?: Upgrades;
  quota?: SiteLicenseQuota;
  run_limit?: number;
  apply_limit?: number;
}

export type SiteLicenses = { [uuid: string]: SiteLicense };
