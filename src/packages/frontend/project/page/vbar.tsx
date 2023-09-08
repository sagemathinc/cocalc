/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { AccountStore } from "@cocalc/frontend/account";
import { redux } from "@cocalc/frontend/app-framework";

// in the other_settings map
export const VBAR_KEY = "vertical_fixed_bar";

export const VBAR_EXPLANATION = (
  <>
    This feature modifies the functionality of the project's left-side button
    bar. By default, it displays buttons for full pages and small caret signs
    for flyout panels. When selecting the "full pages" option, only buttons are
    shown, and they open full pages upon clicking. Conversely, when opting for
    the "flyout panels" mode, only flyout panels expand upon clicking. In both
    of the latter cases, the alternative panel type can be displayed by
    shift-clicking on the corresponding button.
  </>
);

export const VBAR_OPTIONS = {
  both: "Full pages and flyout panels",
  flyout: "Buttons expand/collapse compact flyouts",
  full: "Buttons show full pages",
} as const;

// New users created after this date will have the default VBAR option set to "flyout"
function getDefaultVBAROption() {
  const store: AccountStore = redux.getStore("account");
  if (store == null) return "both";
  const created = store.get("created");
  // check that cretaed is a Date
  if (created == null || !(created instanceof Date)) return "both";
  // if created is after 2023-09-10 return "flyout", else "both"
  if (created > new Date("2023-09-10")) {
    return "flyout";
  } else {
    return "both";
  }
}

export function getValidVBAROption(
  vbar_setting: any
): keyof typeof VBAR_OPTIONS {
  if (typeof vbar_setting !== "string" || VBAR_OPTIONS[vbar_setting] == null) {
    return getDefaultVBAROption();
  }
  return vbar_setting as keyof typeof VBAR_OPTIONS;
}
