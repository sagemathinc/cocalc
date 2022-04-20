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
  const tokens = [
    `${disk.size_gb} GB`,
    `${DISK_NAMES[disk.speed] ?? disk.speed} speed`,
  ];
  if (disk.name != null) {
    tokens.push(`named "${disk.name}"`);
  }
  return to_human_list(tokens);
}

export function dedicatedVmDisplay(v?: DedicatedVM): string {
  if (v == null) throw Error("dedicated_vm must be defined");
  const vm = PRICES.vms[v.machine];
  if (vm == null) {
    return `machine '${v.machine}'`;
  }
  return vm.title;
}
