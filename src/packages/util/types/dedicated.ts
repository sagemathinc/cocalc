/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

export interface VMsType {
  [id: string]:
    | {
        title: string;
        price_day: number;
        spec: { mem: number; cpu: number };
        quota: { dedicated_vm: string }; // only those defined in VMS below
        stripeID: string; // partial code for the stripe product id
      }
    | undefined;
}

export interface DiskType {
  [id: string]:
    | {
        title: string;
        price_day: number;
        iops: string;
        mbps: string;
        stripeID: string; // partial code for the stripe product id
        quota: {
          dedicated_disk: {
            size_gb: number;
            speed: DedicatedDiskSpeeds;
            name?: string;
          };
        };
      }
    | undefined;
}

export const DedicatedDiskSpeedNames = ["standard", "balanced", "ssd"] as const;

export type DedicatedDiskSpeeds = typeof DedicatedDiskSpeedNames[number];

export interface DedicatedDiskConfig {
  size_gb: number;
  speed: DedicatedDiskSpeeds;
  name?: string; // the ID of the disk, globally unique, manually set by user
}

export type DedicatedDisk = DedicatedDiskConfig | false;

export type DedicatedVM = {
  name?: string; // the ID of the VM, globally unique, derived from the license-ID, generated upon license creation or maybe manually.
  machine: string;
};

export const DISK_NAMES: { [type in DedicatedDiskSpeeds]: string } = {
  standard: "slow",
  balanced: "medium",
  ssd: "fast",
};

export function isDedicatedDisk(d): d is DedicatedDisk {
  return (
    d != null &&
    typeof d.size_gb === "number" &&
    ["ssd", "standard", "balanced"].includes(d.type)
  );
}
