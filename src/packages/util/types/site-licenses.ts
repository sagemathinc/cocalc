/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { User } from "@cocalc/util/licenses/purchase/types";
import { Upgrades } from "@cocalc/util/upgrades/types";
import { DedicatedDisk, DedicatedVM } from "./dedicated";

export type GPU = {
  num?: number; // usualy 1, to set nvidia.com/gpu=1, 0 means "disabled"
  toleration?: string; // e.g. gpu=cocalc for key=value
  nodeLabel?: string; // e.g. gpu=cocalc for key=value
  resource?: string; // default: $GPU_DEFAULT_RESOURCE
};

export interface SiteLicenseQuota {
  ram?: number;
  dedicated_ram?: number;
  cpu?: number;
  dedicated_cpu?: number;
  disk?: number;
  always_running?: boolean;
  member?: boolean;
  user?: User;
  dedicated_vm?: DedicatedVM | false;
  dedicated_disk?: DedicatedDisk;
  // idle_timeouts came later:
  // 1. they don't mix, just like member/free and always_running does not mix
  // 2. we define the timeout spans indirectly, gives us a bit of room to modify this later on.
  idle_timeout?: "short" | "medium" | "day";
  boost?: boolean; // default false
  ext_rw?: boolean; // on-prem: make the /ext mountpoint read/writable
  // JSON array of Array of JSON Patch Operations, e.g. "[{op: \"add\", path: \"/foo\", value: \"bar\"}]"
  // It's not an array of objects, because somewhere the array is converted to weird map of "0, 1, 2,..." indexed objects.
  patch?: string;
  gpu?: GPU | boolean;
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
