/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/**
 * Dark mode state tracking for CoCalc.
 *
 * This module tracks whether the app is currently in dark mode based on
 * the native color theme system (not the legacy DarkReader overlay).
 * The state is updated by the theme context in render.tsx.
 */

let currentDarkMode: boolean = false;

/**
 * Returns whether the app is currently in dark mode.
 * Used by antd-bootstrap.tsx to adjust button styles.
 */
export function inDarkMode(): boolean {
  return currentDarkMode;
}

/**
 * Called by the theme system (render.tsx) when the resolved theme changes.
 */
export function setDarkModeState(isDark: boolean): void {
  currentDarkMode = isDark;
}
