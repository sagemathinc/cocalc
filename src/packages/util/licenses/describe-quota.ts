/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
To avoid inconsistency, we are going to follow the style guide/table from
the "Microsoft Writing Style Guide" for things like "3 GB":

https://learn.microsoft.com/en-us/style-guide/a-z-word-list-term-collections/term-collections/bits-bytes-terms

We were just making stuff up all over in CoCalc based on what other sites
do, and the net result was things got inconsistent.
*/

import {
  LicenseIdleTimeouts,
  untangleUptime,
  Uptime,
} from "../consts/site-license";
import { capitalize, is_array, plural, round2 } from "../misc";
import { SiteLicenseQuota } from "../types/site-licenses";
import { loadPatch } from "../upgrades/quota";
import { dedicatedDiskDisplay, dedicatedVmDisplay } from "../upgrades/utils";
import type { PurchaseInfo } from "./purchase/types";
import { FAIR_CPU_MODE } from "@cocalc/util/upgrade-spec";

export function describeQuotaFromInfo(
  info: Partial<PurchaseInfo>,
  withName = true,
): string {
  const { type } = info;
  switch (type) {
    case "quota":
      const { idle_timeout, always_running } = untangleUptime(
        info.custom_uptime,
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
        run_limit: info.run_limit || info.quantity,
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

function fixUptime(quota) {
  // regarding quota.uptime: it is assumed that all calls already query using the schema defined
  // in SiteLicenseQuota, but if not, we untangle the uptime field.
  if (quota.uptime != null) {
    const { always_running, idle_timeout } = untangleUptime(quota.uptime);
    quota.always_running = always_running;
    quota.idle_timeout = idle_timeout;
    delete quota.uptime;
  }
}

export function describe_quota(
  quota: SiteLicenseQuota & { uptime?: Uptime; run_limit?: number },
  short?: boolean,
): string {
  //console.log(`describe_quota (short=${short})`, quota);

  fixUptime(quota);

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

  // If onPremQuota becomes true, we only want to show non-trivial upgrades in the license description. Why?
  // Usually, upgrades to quotas are provided by other licenses, not the ones that provide on-prem modifications.
  let onPremQuota = false;
  if (quota.ext_rw) {
    onPremQuota = true;
    v.push("read/write access to global files");
  }
  if (typeof quota.patch === "string" && quota.patch.length > 0) {
    onPremQuota = true;
    const n = loadPatch(quota.patch).length;
    v.push(`${n} deployment ${plural(n, "patch", "patches")}`);
  }
  hideNetwork ||= onPremQuota;

  if (onPremQuota ? (quota.ram ?? 1) > 2 : quota.ram) {
    v.push(`${quota.ram} GB RAM`);
  }
  if (!FAIR_CPU_MODE) {
    if (onPremQuota ? (quota.cpu ?? 1) > 1 : quota.cpu) {
      v.push(`${quota.cpu} shared ${plural(quota.cpu, "vCPU")}`);
    }
  }
  if (quota.disk) {
    v.push(`${quota.disk} GB disk`);
  }
  if (quota.dedicated_ram) {
    v.push(`${quota.dedicated_ram} GB dedicated RAM`);
  }
  if (!FAIR_CPU_MODE) {
    if (quota.dedicated_cpu) {
      v.push(
        `${quota.dedicated_cpu} dedicated ${plural(quota.dedicated_cpu, "vCPU")}`,
      );
    }
  }
  if (quota.gpu) {
    const { gpu } = quota;
    const num = gpu === true ? 1 : (gpu.num ?? 1);
    v.push(`${num} GPU(s)`);
  }

  if (
    typeof quota.dedicated_vm !== "boolean" &&
    typeof quota.dedicated_vm?.machine === "string"
  ) {
    hideNetwork = true;
    v.push(
      `hosting on a Dedicated VM providing ${dedicatedVmDisplay(
        quota.dedicated_vm,
      )}`,
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
      if (it != null && (onPremQuota ? quota.idle_timeout != "short" : true)) {
        v.push(`${it.label} timeout`);
      }
    }
  }
  if (!hideNetwork && !isBoost) {
    v.push("network"); // always provided, because we trust customers.
  }
  if (quota.run_limit) {
    v.push(
      `up to ${quota.run_limit} running ${plural(quota.run_limit, "project")}`,
    );
  }
  let describePeriod = "";
  const period = quota["period"];
  const range = quota["range"];
  if (period) {
    if (period == "monthly") {
      describePeriod = " (monthly subscription)";
    } else if (period == "yearly") {
      describePeriod = " (yearly subscription)";
    } else if (
      period == "range" &&
      range != null &&
      is_array(range) &&
      range.length == 2
    ) {
      // specific range
      const v = range.map((x) => new Date(x).toLocaleString());
      const days = round2(
        (new Date(range[1]).valueOf() - new Date(range[0]).valueOf()) /
          (1000 * 60 * 60 * 24),
      );
      describePeriod = ` (${v[0]} - ${v[1]}, ${days} ${plural(Math.round(days), "day")})`;
    }
  }

  return `${intro} ${v.join(", ")}${describePeriod}`;
}

// similar to the above, but very short for the info bar on those store purchase pages.
// instead of overloading the above with even more special cases, this brings it quickly to the point
export function describeQuotaOnLine(
  quota: SiteLicenseQuota & { uptime?: Uptime; run_limit?: number },
): string {
  fixUptime(quota);

  const v: string[] = [];

  if (quota.ram) {
    v.push(`${quota.ram} GB RAM`);
  }
  if (!FAIR_CPU_MODE && quota.cpu) {
    v.push(`${quota.cpu} ${plural(quota.cpu, "vCPU")}`);
  }
  if (quota.disk) {
    v.push(`${quota.disk} GB disk`);
  }
  if (quota.dedicated_ram) {
    v.push(`${quota.dedicated_ram} GB dedicated RAM`);
  }
  if (quota.dedicated_cpu) {
    v.push(
      `${quota.dedicated_cpu} dedicated ${plural(quota.dedicated_cpu, "vCPU")}`,
    );
  }

  if (
    typeof quota.dedicated_vm !== "boolean" &&
    typeof quota.dedicated_vm?.machine === "string"
  ) {
    v.push(`Dedicated VM ${dedicatedVmDisplay(quota.dedicated_vm)}`);
  } else {
    if (quota.member) {
      v.push("member");
    }
  }

  if (
    quota.dedicated_disk != null &&
    typeof quota.dedicated_disk !== "boolean"
  ) {
    v.push(
      `Dedicated Disk (${dedicatedDiskDisplay(quota.dedicated_disk, "short")})`,
    );
  }

  if (quota.always_running) {
    v.push("always running");
  } else {
    if (quota.idle_timeout != null) {
      const it = LicenseIdleTimeouts[quota.idle_timeout];
      if (it != null) {
        v.push(`${it.labelShort} timeout`);
      }
    }
  }

  if (quota.user) {
    const isBoost = quota.boost === true;
    const booster = isBoost ? " booster" : "";
    v.push(`${capitalize(quota.user)}${booster}`);
  }

  if (quota.run_limit) {
    v.push(`up to ${quota.run_limit} ${plural(quota.run_limit, "project")}`);
  }

  return `${v.join(", ")}`;
}
