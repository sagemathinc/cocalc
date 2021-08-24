/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React, Rendered } from "../app-framework";
import { load_target } from "../history";

export function BillingPageLink(opts: { text?: string }): Rendered {
  let { text } = opts;
  if (!text) {
    text = "billing page";
  }
  return (
    <a onClick={visit_billing_page} style={{ cursor: "pointer" }}>
      {text}
    </a>
  );
}

export function visit_billing_page(): void {
  load_target("settings/billing");
}
