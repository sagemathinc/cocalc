/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

export interface VMsType {
  [id: string]: {
    name?: string;
    price_day: number;
    spec: { mem: number; cpu: number };
    quota: { dedicated_vm: string }; // only those defined in VMS below
  };
}

export interface DiskType {
  [id: string]: {
    name: string;
    price_day: number;
    quota: { dedicated_disk: { size_gb: number; type: DedicatedDiskTypes } };
  };
}


export type DedicatedDiskTypes = "ssd" | "standard" | "balanced";

export type DedicatedDisk =
  | {
      size_gb: number;
      type: DedicatedDiskTypes;
      name: string; // the ID of the disk, globally unique, derived from the license-ID, generated upon license creation or maybe manually.
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