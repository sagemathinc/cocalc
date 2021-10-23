/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { PurchaseInfo } from "./util";
import openSupportTab from "@cocalc/frontend/support/open";

export function create_quote_support_ticket(info: PurchaseInfo): void {
  const subject = "Request for a quote";
  const body = `Hello,\n\nI would like to request a quote.  I filled out the online form with the\ndetails listed below:\n\n\`\`\`\n${JSON.stringify(
    info,
    undefined,
    2
  )}\n\`\`\``;
  const type = "question";
  openSupportTab({ subject, body, type, hideExtra:true });
}
