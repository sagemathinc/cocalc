/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
 * ThemeContext – provides the active ColorTheme to the entire React tree.
 *
 * Architecture:
 *   - Only light theme presets exist in COLOR_THEMES
 *   - When dark mode is active, deriveDarkTheme() transforms the light theme
 *   - Terminal / editor "cocalc" auto scheme resolves via theme.isDark
 *
 * Dark mode:
 *   - "off"    → use selected light theme as-is
 *   - "on"     → auto-derive dark variant
 *   - "system" → follow prefers-color-scheme, dynamically
 */

import { createContext, useContext, useEffect, useMemo, useState } from "react";

import { useTypedRedux } from "@cocalc/frontend/app-framework";
import {
  type BaseColors,
  type ColorTheme,
  type NativeDarkMode,
  OTHER_SETTINGS_COLOR_THEME,
  OTHER_SETTINGS_CUSTOM_THEME_COLORS,
  OTHER_SETTINGS_NATIVE_DARK_MODE,
  deriveDarkTheme,
  resolveUserTheme,
  THEME_DEFAULT,
} from "@cocalc/util/theme";

export const ThemeContext = createContext<ColorTheme>(THEME_DEFAULT);

/** Read the active ColorTheme anywhere in the component tree. */
export function useColorTheme(): ColorTheme {
  return useContext(ThemeContext);
}

/** Listen to the OS prefers-color-scheme media query. */
function useSystemDarkMode(): boolean {
  const [dark, setDark] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-color-scheme: dark)").matches,
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => setDark(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return dark;
}

/**
 * Hook used by the root provider to build the current theme from Redux state.
 * Returns a stable ColorTheme reference (memoised on the relevant setting keys).
 */
export function useResolvedColorTheme(): ColorTheme {
  const other_settings = useTypedRedux("account", "other_settings");
  const systemPrefersDark = useSystemDarkMode();

  const themeId = other_settings?.get(OTHER_SETTINGS_COLOR_THEME) as
    | string
    | undefined;

  const customColorsJson = other_settings?.get(
    OTHER_SETTINGS_CUSTOM_THEME_COLORS,
  ) as string | undefined;

  const nativeDarkMode = (other_settings?.get(
    OTHER_SETTINGS_NATIVE_DARK_MODE,
  ) ?? "off") as NativeDarkMode;

  return useMemo(() => {
    let customBase: BaseColors | null = null;
    if (customColorsJson) {
      try {
        customBase = JSON.parse(customColorsJson) as BaseColors;
      } catch {
        // bad JSON – ignore
      }
    }

    // Resolve the light theme first
    const lightTheme = resolveUserTheme(themeId, customBase);

    // Determine if we should derive a dark variant
    const wantDark =
      nativeDarkMode === "on" ||
      (nativeDarkMode === "system" && systemPrefersDark);

    if (wantDark) {
      return deriveDarkTheme(lightTheme);
    }

    return lightTheme;
  }, [themeId, customColorsJson, nativeDarkMode, systemPrefersDark]);
}
