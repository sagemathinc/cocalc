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
  let message = "";
  if (typeof err === "string") {
    message = err;
  } else if (err instanceof Error) {
    message = err.message;
  } else if (err?.message && typeof err.message === "string") {
    message = err.message;
  } else {
    try {
      message = JSON.stringify(err);
    } catch {
      message = String(err);
    }
  }
  if (!message) {
    message = "Unknown error";
  }
  alert_message({ type: "error", message: `Settings error -- ${message}` });
}
