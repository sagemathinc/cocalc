/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { to_human_list } from "../misc";
import { DedicatedDisk, DedicatedVM, DISK_NAMES } from "../types/dedicated";
import { SiteLicenseQuota } from "../types/site-licenses";
import { PRICES } from "./dedicated";

export function dedicatedDiskDisplay(
  disk?: DedicatedDisk,
  variant: "short" | "long" = "long"
): string {
  if (disk == null) throw new Error("dedicated_disk must be defined");
  if (typeof disk === "boolean") return "";

  if (variant === "short") {
    return to_human_list([
      `${disk.size_gb}G`,
      `${DISK_NAMES[disk.speed] ?? disk.speed}`,
    ]);
  } else {
    const tokens = [
      `${disk.size_gb}G size`,
      `${DISK_NAMES[disk.speed] ?? disk.speed} speed`,
    ];
    if (disk.name != null) {
      tokens.push(`named "${disk.name}"`);
    }
    return to_human_list(tokens);
  }
}

export function dedicatedVmDisplay(v?: DedicatedVM): string {
  if (v == null) throw Error("dedicated_vm must be defined");
  const vm = PRICES.vms[v.machine];
  if (vm == null) {
    return `machine '${v.machine}'`;
  }
  return vm.title;
}

function isSetAndZero(
  quota: SiteLicenseQuota,
  key: keyof SiteLicenseQuota
): boolean {
  return quota[key] != null && quota[key] === 0;
}

/**
 * Heuristic to check if a given license is a booster license
 *
 * The license argument is compatible with the frontend's SiteLicensePublicInfo type
 */
export function isBoostLicense(license?: {
  quota?: SiteLicenseQuota;
}): boolean {
  if (license == null) return false;
  const { quota } = license;
  if (quota == null) return false;
  if (quota.boost === true) return true;
  if (quota.boost === false) return false;
  // what remains is the case, where boost is not set, but we have cpu, memory or disk upgrades,
  // where any of them is zero -- this is a fallback for manually generated licenses by admins or old ones
  if (
    isSetAndZero(quota, "cpu") ||
    isSetAndZero(quota, "ram") ||
    isSetAndZero(quota, "disk")
  ) {
    // if there are any other upgrades, this is not a pure boost license
    return !(
      quota.ext_rw != null
    );
  }
  return false;
}
