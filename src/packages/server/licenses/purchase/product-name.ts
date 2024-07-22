/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { describeQuotaFromInfo } from "@cocalc/util/licenses/describe-quota";
import { PurchaseInfo } from "@cocalc/util/licenses/purchase/types";
import { plural } from "@cocalc/util/misc";
import { getDays } from "@cocalc/util/stripe/timecalcs";

export function getProductName(info: PurchaseInfo): string {
  if (info.type == "vouchers") {
    // for vouchers just use the sequential id from the database.
    // This does determine what is purchased, but since it can be
    // a complicated arbitrary combinations of an unlimited number
    // of licenses, this is the only option.  We can't encode all
    // of that in this string; instead, we'll make sure this is easy
    // for admins to look up.
    return `${info.quantity} Vouchers (id=${info.id}) - ${info.title}`;
  }

  // Similar to getProductId, but meant to be human readable.
  // This name is what customers see on invoices,
  // so it's very valuable as it reflects what they bought clearly.
  const period = getPeriod(info);
  // ATTN: this is the name for an SKU, not the individual product the user buys.
  // Hence this must not include the name of the VM or disk.
  const desc = describeQuotaFromInfo(info, false);
  return `${desc} - ${period}`;
}

function getPeriod(info: PurchaseInfo): string {
  if (info.type == "vouchers") {
    // no notion of period, since each license provided by voucher
    // could have different number of days in it.
    return "vouchers";
  }
  if (info.subscription == "no") {
    const n = getDays(info);
    return `${n} ${plural(n, "day")}`;
  } else {
    return "subscription";
  }
}
