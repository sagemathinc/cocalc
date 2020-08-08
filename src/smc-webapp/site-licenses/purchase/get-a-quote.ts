/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { redux } from "../../app-framework";
import { PurchaseInfo } from "./util";

export function create_quote_support_ticket(info: PurchaseInfo): void {
  const actions = redux.getActions("support");
  actions.set_show(true);
  const subject = "Request for a quote";
  const body = `Hello,\n\nI would like to request a quote.  I filled out the online form with the\ndetails listed below:\n\n\`\`\`\n${JSON.stringify(
    info,
    undefined,
    2
  )}\n\`\`\``;
  actions.set({
    body,
    subject,
    hide_extra_info: true,
  });
}
