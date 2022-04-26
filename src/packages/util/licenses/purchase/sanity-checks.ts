/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { LicenseIdleTimeouts, Uptime } from "@cocalc/util/consts/site-license";
import {
  DedicatedDiskSpeedNames,
  DedicatedDiskSpeeds,
} from "@cocalc/util/types/dedicated";
import {
  getDedicatedDiskKey,
  MAX_DEDICATED_DISK_SIZE,
  PRICES,
} from "@cocalc/util/upgrades/dedicated";
import { isEqual } from "lodash";
import { testDedicatedDiskNameBasic } from "../check-disk-name-basics";
import { checkDedicateDiskNameUniqueness } from "../check-disk-name-uniqueness";
import { compute_cost } from "./compute-cost";
import { MAX } from "./consts";
import { PurchaseInfo } from "./types";

// throws an exception if it spots something funny...
export async function sanity_checks(pool, info: PurchaseInfo) {
  const { type } = info;
  if (typeof info != "object") {
    throw Error("must be an object");
  }

  if (!["quota", "vm", "disk"].includes(type)) {
    throw new Error(`type must be one of quota, vm, disk – but got "${type}"`);
  }

  sanity_check_start_end(info);
  sanity_check_quota(info);
  await sanity_check_dedicated(pool, info);
  sanity_check_cost(info);
}

function sanity_check_cost(info: PurchaseInfo) {
  if (!isEqual(info.cost, compute_cost(info))) {
    throw Error("cost does not match");
  }
}

function sanity_check_start_end(info: PurchaseInfo) {
  const { type } = info;

  if ((type === "quota" && info.subscription === "no") || type === "vm") {
    if (info.start == null) {
      throw Error("must have start date set");
    }
  }

  if (type === "vm" || type === "quota") {
    const start = info.start ? new Date(info.start) : undefined;
    const end = info.end ? new Date(info.end) : undefined;

    if (info.subscription == "no") {
      if (start == null || end == null) {
        throw Error(
          "start and end dates must both be given if not a subscription"
        );
      }

      const days = Math.round(
        (end.valueOf() - start.valueOf()) / (24 * 60 * 60 * 1000)
      );
      if (days <= 0) {
        throw Error("end date must be at least one day after start date");
      }
    }
  }
}

function sanity_check_quota(info: PurchaseInfo) {
  const { type } = info;
  if (type !== "quota") return;
  for (const x of ["ram", "cpu", "disk", "dedicated_ram", "dedicated_cpu"]) {
    const field = "custom_" + x;
    if (typeof info[field] !== "number") {
      throw Error(`field "${field}" must be number`);
    }
    if (info[field] < 0 || info[field] > MAX[field]) {
      throw Error(`field "${field}" too small or too big`);
    }
  }
  if (info.custom_uptime == null || typeof info.custom_uptime !== "string") {
    throw new Error(`field "custom_uptime" must be set`);
  }

  if (
    LicenseIdleTimeouts[info.custom_uptime] == null &&
    info.custom_uptime != ("always_running" as Uptime)
  ) {
    const tos = Object.keys(LicenseIdleTimeouts).join(", ");
    throw new Error(
      `field "custom_uptime" must be one of ${tos} or "always_running"`
    );
  }

  for (const x of ["member"]) {
    const field = "custom_" + x;
    if (typeof info[field] !== "boolean") {
      throw Error(`field "${field}" must be boolean`);
    }
  }
}

async function sanity_check_dedicated(pool, info: PurchaseInfo) {
  const { type } = info;

  if (type === "vm") {
    if (info.dedicated_vm == null) {
      throw new Error(
        `license type "vm", but there is no data about a dedicated VM`
      );
    }
    const machine = info.dedicated_vm.machine;
    if (typeof machine !== "string")
      throw new Error(`field dedicated_vm must be string`);
    if (PRICES.vms[machine] == null)
      throw new Error(`field dedicated_vm ${machine} not found`);
  }

  if (type === "disk") {
    if (info.dedicated_disk == null) {
      throw new Error(
        `license type "disk", but there is no data about a dedicated disk`
      );
    }
    const dd = info.dedicated_disk;
    if (typeof dd === "object") {
      const { size_gb, speed } = dd;
      if (typeof size_gb !== "number") {
        throw new Error(`field dedicated_disk.size must be number`);
      }
      if (size_gb < 0 || size_gb > MAX_DEDICATED_DISK_SIZE) {
        throw new Error(`field dedicated_disk.size_gb < 0 or too big`);
      }
      if (
        typeof speed !== "string" ||
        !DedicatedDiskSpeedNames.includes(speed as DedicatedDiskSpeeds)
      )
        throw new Error(
          `field dedicated_disk.speed must be string and one of ${DedicatedDiskSpeedNames.join(
            ", "
          )}`
        );

      const key = getDedicatedDiskKey({ speed, size_gb });
      if (PRICES.disks[key] == null) {
        throw new Error(`field dedicated_disk "${key}" not found`);
      }

      // check lenght/charaters of disk name
      testDedicatedDiskNameBasic(dd.name);
      // finally we check again to make sure the disk name is unique
      await checkDedicateDiskNameUniqueness(pool, dd.name);
    }
  }
}
