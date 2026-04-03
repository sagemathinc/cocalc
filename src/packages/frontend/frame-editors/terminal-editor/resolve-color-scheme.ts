/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/**
 * Resolve the "cocalc" terminal color scheme to its concrete variant
 * based on the current dark mode state.
 *
 * We read dark mode settings from the Redux account store.
 * This is a synchronous lookup because terminal theme resolution
 * needs to happen immediately.
 */

import { redux } from "@cocalc/frontend/app-framework";
import {
  OTHER_SETTINGS_COLOR_THEME,
  OTHER_SETTINGS_NATIVE_DARK_MODE,
  OTHER_SETTINGS_RANDOM_THEME_SEED,
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

  // nativeDark === "off" — but the user might have chosen a theme that's
  // inherently dark (shouldn't happen with the new system, but be safe)
  const themeId = String(other.get(OTHER_SETTINGS_COLOR_THEME) ?? "default");
  const randomSeed = Number(other.get(OTHER_SETTINGS_RANDOM_THEME_SEED) ?? 0);
  const theme = getColorTheme(themeId, randomSeed);
  return theme.isDark ?? false;
}

export function resolveTerminalColorScheme(scheme: string): string {
  if (scheme === "cocalc") {
    return isCurrentlyDark() ? "cocalc-dark" : "cocalc-light";
  }
  return scheme;
}
