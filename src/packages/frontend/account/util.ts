/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { alert_message } from "@cocalc/frontend/alerts";
import { redux } from "@cocalc/frontend/app-framework";

export function set_account_table(obj: object): void {
  redux.getTable("account").set(obj);
}

export function ugly_error(err: any): void {
  if (typeof err != "string") {
    err = JSON.stringify(err);
  }
  alert_message({ type: "error", message: `Settings error -- ${err}` });
}
