/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { describeQuotaFromInfo } from "@cocalc/util/licenses/describe-quota";
import { PurchaseInfo } from "@cocalc/util/licenses/purchase/types";
import { plural } from "@cocalc/util/misc";
import { getDays } from "@cocalc/util/stripe/timecalcs";

export function getProductName(info: PurchaseInfo): string {
  // Similar to getProductId, but meant to be human readable.
  // This name is what customers see on invoices,
  // so it's very valuable as it reflects what they bought clearly.
  const period = getPeriod(info);
  // ATTN: this is the name for an SKU, not the individual product the user buys.
  // Hence this must not include the name of the VM or disk.
  const desc = describeQuotaFromInfo(info, false);
  return `${desc} - ${period}`;
}

function getPeriod(info: PurchaseInfo) {
  if (info.subscription == "no") {
    const n = getDays(info);
    return `${n} ${plural(n, "day")}`;
  } else {
    return "subscription";
  }
}
