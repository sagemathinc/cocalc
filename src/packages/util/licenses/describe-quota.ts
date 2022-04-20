/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import {
  LicenseIdleTimeouts,
  untangleUptime,
  Uptime,
} from "../consts/site-license";
import { capitalize, plural } from "../misc";
import { SiteLicenseQuota } from "../types/site-licenses";
import { dedicatedDiskDisplay, dedicatedVmDisplay } from "../upgrades/utils";
import { PurchaseInfo } from "./purchase/types";

export function describeQuotaFromInfo(
  info: Partial<PurchaseInfo>,
  withName = true
): string {
  const { type } = info;
  switch (type) {
    case "quota":
      const { idle_timeout, always_running } = untangleUptime(
        info.custom_uptime
      );
      return describe_quota({
        ram: info.custom_ram,
        cpu: info.custom_cpu,
        disk: info.custom_disk,
        always_running,
        idle_timeout,
        member: info.custom_member,
        user: info.user,
        boost: info.boost,
      });

    case "vm":
      if (info.dedicated_vm == null) {
        throw new Error(`dedicated_vm must be defined`);
      }
      // we make a copy, because we eventually delete a field
      const dedicated_vm = { ...info.dedicated_vm };
      if (!withName) delete dedicated_vm?.name;
      return describe_quota({ dedicated_vm });

    case "disk":
      if (
        info.dedicated_disk == null ||
        typeof info.dedicated_disk === "boolean"
      ) {
        throw new Error(`dedicated_disk must be defined and not a boolean`);
      }
      // we make a copy, because we eventually delete a field
      const dedicated_disk = { ...info.dedicated_disk };
      if (!withName) delete dedicated_disk?.name;
      return describe_quota({ dedicated_disk });

    default:
      throw new Error(`unkonwn type ${type}`);
  }
}

export function describe_quota(
  quota: SiteLicenseQuota & { uptime?: Uptime },
  short?: boolean
): string {
  // regarding quota.uptime: it is assumed that all calls already query using the schema defined
  // in SiteLicenseQuota, but if not, we untangle the uptime field.
  console.log(quota);
  if (quota.uptime != null) {
    const { always_running, idle_timeout } = untangleUptime(quota.uptime);
    quota.always_running = always_running;
    quota.idle_timeout = idle_timeout;
    delete quota.uptime;
  }

  const v: string[] = [];
  let intro: string = "";
  let hideNetwork = false;
  const isBoost = quota.boost === true;
  const booster = isBoost ? " booster" : "";
  if (quota.user) {
    if (short) {
      intro = `${capitalize(quota.user)}${booster},`;
    } else {
      intro = `${capitalize(quota.user)} license${booster} providing`;
    }
  } else {
    // dedicated resources do not have a specific user
    intro = short ? "License" : "License providing";
  }

  if (quota.ram) {
    v.push(`${quota.ram}GB RAM`);
  }
  if (quota.cpu) {
    v.push(`${quota.cpu} shared ${plural(quota.cpu, "CPU")}`);
  }
  if (quota.disk) {
    v.push(`${quota.disk}GB disk`);
  }
  if (quota.dedicated_ram) {
    v.push(`${quota.dedicated_ram}GB dedicated RAM`);
  }
  if (quota.dedicated_cpu) {
    v.push(
      `${quota.dedicated_cpu} dedicated ${plural(quota.dedicated_cpu, "CPU")}`
    );
  }

  if (
    typeof quota.dedicated_vm !== "boolean" &&
    typeof quota.dedicated_vm?.machine === "string"
  ) {
    hideNetwork = true;
    v.push(
      `hosting on a Dedicated VM providing ${dedicatedVmDisplay(
        quota.dedicated_vm
      )}`
    );
  } else {
    if (quota.member) {
      v.push("member" + (short ? "" : " hosting"));
    }
  }

  if (
    quota.dedicated_disk != null &&
    typeof quota.dedicated_disk !== "boolean"
  ) {
    hideNetwork = true;
    v.push(`a Dedicated Disk (${dedicatedDiskDisplay(quota.dedicated_disk)})`);
  }

  if (quota.always_running) {
    v.push("always running");
  } else {
    if (quota.idle_timeout != null) {
      const it = LicenseIdleTimeouts[quota.idle_timeout];
      if (it != null) {
        v.push(`${it.label} timeout`);
      }
    }
  }
  if (!hideNetwork && !isBoost) {
    v.push("network"); // always provided, because we trust customers.
  }
  return `${intro} ${v.join(", ")}`;
}
