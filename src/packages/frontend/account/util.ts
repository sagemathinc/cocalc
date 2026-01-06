/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import type { AccountActions } from "@cocalc/frontend/account/actions";
import { alert_message } from "@cocalc/frontend/alerts";
import { redux } from "@cocalc/frontend/app-framework";
import type {
  PreferencesSubTabKey,
  PreferencesSubTabType,
} from "@cocalc/util/types/settings";
import { VALID_PREFERENCES_SUB_TYPES } from "@cocalc/util/types/settings";

export function set_account_table(obj: object): void {
  redux.getTable("account").set(obj);
}

export function ugly_error(err: any): void {
  if (typeof err != "string") {
    err = JSON.stringify(err);
  }
  alert_message({ type: "error", message: `Settings error -- ${err}` });
}

/**
 * Helper function to validate and create preferences sub-tab key
 */
function createPreferencesSubTabKey(
  subTab: string,
): PreferencesSubTabKey | null {
  if (VALID_PREFERENCES_SUB_TYPES.includes(subTab as PreferencesSubTabType)) {
    const validSubTab = subTab as PreferencesSubTabType;
    return `preferences-${validSubTab}`;
  }
  return null;
}

/**
 * Type for account navigation key
 */
export type AccountPageKey =
  | "index"
  | "profile"
  | PreferencesSubTabKey
  | "subscriptions"
  | "licenses"
  | "payg"
  | "billing"
  | "support"
  | "signout";

/**
 * Callbacks for special cases
 */
interface SwitchAccountPageCallbacks {
  onBilling?: () => void;
  onSignout?: () => void;
}

/**
 * Core logic for switching account pages.
 *
 * Usage:
 *   switchAccountPage(key, accountActions, { onBilling: () => {...} })
 */
export function switchAccountPage(
  key: AccountPageKey | string,
  accountActions: AccountActions,
  callbacks?: SwitchAccountPageCallbacks,
): void {
  // Handle settings overview page
  if (key === "settings" || key === "index") {
    accountActions.setState({
      active_page: "index",
      active_sub_tab: undefined,
    });
    accountActions.push_state(`/settings/index`);
    return;
  }

  // Handle profile as standalone page
  if (key === "profile") {
    accountActions.setState({
      active_page: "profile",
      active_sub_tab: undefined,
    });
    accountActions.push_state(`/profile`);
    return;
  }

  // Handle preferences sub-tabs
  if (typeof key === "string" && key.startsWith("preferences-")) {
    const subTab = key.replace("preferences-", "");
    const subTabKey = createPreferencesSubTabKey(subTab);
    if (subTabKey) {
      accountActions.setState({
        active_sub_tab: subTabKey,
        active_page: "preferences",
      });
      accountActions.push_state(`/preferences/${subTab}`);
    }
    return;
  }

  // Handle billing (also falls through to navigate)
  if (key === "billing") {
    callbacks?.onBilling?.();
  }

  // Handle signout (does not navigate)
  if (key === "signout") {
    callbacks?.onSignout?.();
    return;
  }

  // Handle all other account pages (subscriptions, licenses, payg, support, etc.)
  // This includes support which has no special action
  accountActions.set_active_tab(key);
  accountActions.push_state(`/${key}`);
}
