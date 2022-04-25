/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import {
  ProductMetadata,
  ProductMetadataDisk,
  ProductMetadataQuota,
  ProductMetadataVM,
  PurchaseInfo,
} from "@cocalc/util/licenses/purchase/types";
import { getDays } from "@cocalc/util/stripe/timecalcs";

function duration(meta, info) {
  if (info.start != null && info.end != null) {
    meta.duration_days = getDays(info);
  }
}

export function getProductMetadata(info: PurchaseInfo): ProductMetadata {
  const { type } = info;

  if (type === "quota") {
    const meta: ProductMetadataQuota = {
      user: info.user,
      ram: info.custom_ram,
      cpu: info.custom_cpu,
      dedicated_ram: info.custom_dedicated_ram,
      dedicated_cpu: info.custom_dedicated_cpu,
      disk: info.custom_disk,
      uptime: info.custom_uptime,
      member: `${info.custom_member}`, // "true" or "false"
      subscription: info.subscription,
      boost: `${!!info.boost}`, // "true" or "false"
    };
    duration(meta, info);
    return meta;
  } else if (type === "vm") {
    // always has a specific start and end date
    const meta: ProductMetadataVM = {
      type: "vm",
      machine: info.dedicated_vm.machine,
    };
    duration(meta, info);
    return meta;
  } else if (type === "disk") {
    if (typeof info.dedicated_disk === "boolean")
      throw new Error(`dedicated_disk is not an object`);
    const meta: ProductMetadataDisk = {
      type: "disk",
      size_gb: info.dedicated_disk.size_gb,
      speed: info.dedicated_disk.speed,
    };
    return meta;
  } else {
    throw new Error(`unknown type: ${type}`);
  }
}
