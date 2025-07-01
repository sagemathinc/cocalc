/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { AccountStore } from "@cocalc/frontend/account";
import { redux } from "@cocalc/frontend/app-framework";
import { VBAR_OPTIONS } from "./vbar-consts";

const FLYOUT_DEFAULT_DATE = new Date("2100-01-01");

// New users created after this date will have the default VBAR option set to "flyout"
function getDefaultVBAROption() {
  const store: AccountStore = redux.getStore("account");
  if (store == null) return "both";
  const created = store.get("created");
  // check that created is a Date
  if (created == null || !(created instanceof Date)) return "both";
  // if created is after this date return "flyout", else "both"
  if (created > FLYOUT_DEFAULT_DATE) {
    return "flyout";
  } else {
    return "both";
  }
}

export function getValidVBAROption(
  vbar_setting: any,
): keyof typeof VBAR_OPTIONS {
  if (typeof vbar_setting !== "string" || VBAR_OPTIONS[vbar_setting] == null) {
    return getDefaultVBAROption();
  }
  return vbar_setting as keyof typeof VBAR_OPTIONS;
}
