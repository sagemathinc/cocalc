/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { commercial } from "../customize";
import { conversion_id, gtag_id, sign_up_id  } from "smc-util/theme";

// conversion tracking (commercial only)
export function track_conversion(type: string, amount?): void {
  if (!commercial) {
    return;
  }
  if ((window as any).DEBUG) {
    return;
  }

  let tag: string = "";
  if (type === "create_account") {
    tag = sign_up_id;
    amount = 1; // that's not true
  } else if (type === "subscription") {
    tag = conversion_id;
  } else {
    console.warn(`unknown conversion type: ${type}`);
    return;
  }

  (window as any).gtag?.("event", "conversion", {
    send_to: `${gtag_id}/${tag}`,
    value: amount,
    currency: "USD",
  });
}
