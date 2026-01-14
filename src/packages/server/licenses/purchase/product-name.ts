/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { PurchaseInfo } from "@cocalc/util/purchases/quota/types";
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
  if (info.subscription == "no") {
    const days = getDays(info);
    return `${days} Day Quota`;
  }
  const interval = info.subscription == "monthly" ? "Monthly" : "Yearly";
  return `${interval} Quota Subscription`;
}
