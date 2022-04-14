/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { to_human_list } from "../misc";
import { DedicatedDisk, DedicatedVM, DISK_NAMES } from "../types/dedicated";
import { PRICES } from "./dedicated";

export function dedicatedDiskDisplay(disk?: DedicatedDisk): string {
  if (disk == null) throw new Error("dedicated_disk must be defined");
  if (typeof disk === "boolean") return "";
  return to_human_list([
    `${disk.size_gb} GB`,
    `${DISK_NAMES[disk.type] ?? disk.type} speed`,
    `named "${disk.name ?? "<unknown>"}"`,
  ]);
}

export function dedicatedVmDisplay(v?: DedicatedVM): string {
  if (v == null) throw Error("dedicated_vm must be defined");
  const vm = PRICES.vms[v.machine];
  if (vm == null) {
    return `machine '${v.machine}'`;
  }
  return vm.title;
}
