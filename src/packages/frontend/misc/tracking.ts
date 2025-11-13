/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { commercial } from "@cocalc/frontend/customize";
import { gtag_id, sign_up_id } from "@cocalc/util/theme";

// conversion tracking (commercial only)
export function track_conversion(type: string): void {
  if (!commercial) {
    return;
  }
  if ((window as any).DEBUG) {
    return;
  }

  let tag: string = "";
  if (type === "create_account") {
    tag = sign_up_id;
  } else {
    console.warn(`unknown conversion type: ${type}`);
    return;
  }

  (window as any).gtag?.("event", "conversion", {
    send_to: `${gtag_id}/${tag}`,
  });
}
