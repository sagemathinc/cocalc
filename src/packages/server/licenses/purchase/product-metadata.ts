/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import {
  ProductMetadata,
  ProductMetadataQuota,
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

  if (type == "vouchers") {
    return {
      type: "vouchers",
      id: info.id,
      title: info.title,
    } as ProductMetadata;
  } else if (type === "quota") {
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
  } else {
    throw new Error(`ProductMetadata: unknown type: ${type}`);
  }
}
