/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

export interface VMsType {
  [id: string]: {
    title?: string;
    price_day: number;
    spec: { mem: number; cpu: number };
    quota: { dedicated_vm: string }; // only those defined in VMS below
  };
}

export interface DiskType {
  [id: string]: {
    title: string;
    price_day: number;
    iops?: string;
    mbps?: string;
    quota: {
      dedicated_disk: {
        size_gb: number;
        type: DedicatedDiskTypes;
        name?: string;
      };
    };
  };
}

export type DedicatedDiskTypes = "ssd" | "standard" | "balanced";

export type DedicatedDisk =
  | {
      size_gb: number;
      type: DedicatedDiskTypes;
      name?: string; // the ID of the disk, globally unique, derived from the license-ID, generated upon license creation or maybe manually.
    }
  | false;

export type DedicatedVM = {
  name: string; // the ID of the VM, globally unique, derived from the license-ID, generated upon license creation or maybe manually.
  machine: string;
};

export const DISK_NAMES: { [type in DedicatedDiskTypes]: string } = {
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

export function dedicated_disk_display(disk: DedicatedDisk): string {
  if (typeof disk === "boolean") return "";
  return `${disk.size_gb} GB, ${DISK_NAMES[disk.type] ?? disk.type} speed`;
}
