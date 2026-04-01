/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/**
 * Resolve the "cocalc" editor color scheme to the concrete light or dark
 * variant, based on the current dark mode state from the account store.
 */

import { redux } from "@cocalc/frontend/app-framework";
import {
  OTHER_SETTINGS_COLOR_THEME,
  OTHER_SETTINGS_NATIVE_DARK_MODE,
  getColorTheme,
} from "@cocalc/util/theme";

function isCurrentlyDark(): boolean {
  const store = redux.getStore("account");
  if (store == null) return false;
  const other = store.get("other_settings");
  if (other == null) return false;

  const nativeDark = String(
    other.get(OTHER_SETTINGS_NATIVE_DARK_MODE) ?? "off",
  );

  if (nativeDark === "on") return true;

  if (nativeDark === "system") {
    if (typeof window !== "undefined") {
      return (
        window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false
      );
    }
  }

  const themeId = String(other.get(OTHER_SETTINGS_COLOR_THEME) ?? "default");
  return getColorTheme(themeId).isDark ?? false;
}

export function resolveEditorColorScheme(scheme: string): string {
  if (scheme === "cocalc") {
    return isCurrentlyDark() ? "cocalc-dark" : "cocalc-light";
  }
  return scheme;
}
