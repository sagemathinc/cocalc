/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/**
 * Resolve the "cocalc" terminal color scheme to its concrete variant
 * based on the current native dark mode state.
 *
 * We read the color theme from the Redux account store to determine
 * whether we're in dark mode.  This is a synchronous lookup because
 * terminal theme resolution needs to happen immediately.
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

  // Check if the selected theme is itself a dark theme
  const themeId = String(other.get(OTHER_SETTINGS_COLOR_THEME) ?? "default");
  return getColorTheme(themeId).isDark ?? false;
}

export function resolveTerminalColorScheme(scheme: string): string {
  if (scheme === "cocalc") {
    return isCurrentlyDark() ? "cocalc-dark" : "cocalc-light";
  }
  return scheme;
}
