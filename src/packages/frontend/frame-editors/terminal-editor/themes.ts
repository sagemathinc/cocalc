/*
 *  This file is part of CoCalc: Copyright © 2020-2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Our predefined terminal color themes.
*/

import { ITheme, Terminal } from "@xterm/xterm";
import { COLOR_THEMES, getThemeName } from "./theme-data";

/** Read a CSS variable from the document root, with fallback. */
function cssVar(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  return (
    getComputedStyle(document.documentElement).getPropertyValue(name).trim() ||
    fallback
  );
}

/**
 * Build a terminal ITheme from CSS variables (the "cocalc-auto" theme).
 * Derives ANSI colors from the syntax highlighting + semantic CSS vars.
 */
function getAutoTheme(): ITheme {
  const bg = cssVar("--cocalc-bg-base", "#ffffff");
  const fg = cssVar("--cocalc-syntax-variable", "#303030");
  const keyword = cssVar("--cocalc-syntax-keyword", "#3a63a3");
  const string = cssVar("--cocalc-syntax-string", "#c9760c");
  const comment = cssVar("--cocalc-syntax-comment", "#909090");
  const number = cssVar("--cocalc-syntax-number", "#c18401");
  const func = cssVar("--cocalc-syntax-function", "#4474c0");
  const type = cssVar("--cocalc-syntax-type", "#8e5bb0");
  const error = cssVar("--cocalc-error", "#f5222d");
  const success = cssVar("--cocalc-success", "#52c41a");
  const warning = cssVar("--cocalc-warning", "#faad14");
  const tertiary = cssVar("--cocalc-text-tertiary", "#808080");
  const primary = cssVar("--cocalc-text-primary", "#303030");
  const secondary = cssVar("--cocalc-text-secondary", "#5f5f5f");

  return {
    background: bg,
    foreground: fg,
    cursor: fg,
    cursorAccent: bg,
    selectionBackground: "rgba(128, 128, 160, 0.25)",
    // ANSI color mapping using theme-derived values
    black: tertiary, // color0
    red: error, // color1
    green: success, // color2
    yellow: warning, // color3
    blue: func, // color4
    magenta: type, // color5
    cyan: keyword, // color6
    white: secondary, // color7
    brightBlack: comment, // color8
    brightRed: number, // color9
    brightGreen: string, // color10
    brightYellow: warning, // color11
    brightBlue: func, // color12
    brightMagenta: type, // color13
    brightCyan: keyword, // color14
    brightWhite: primary, // color15
  };
}

const TERMINAL_AUTO_ID = "cocalc-auto";

/** Resolve the "cocalc" virtual theme to its concrete light/dark variant. */
function resolveCocalcTheme(): string {
  const isDark = cssVar("--cocalc-is-dark", "0") === "1";
  return isDark ? "cocalc-dark" : "cocalc-light";
}

export function background_color(theme_name: string): string {
  if (theme_name === TERMINAL_AUTO_ID) {
    return cssVar("--cocalc-bg-base", "#ffffff");
  }
  // "cocalc" = auto light/dark — resolve based on current dark mode state
  const resolved = theme_name === "cocalc" ? resolveCocalcTheme() : theme_name;
  const t = COLOR_THEMES[getThemeName(resolved)];
  return t.colors[17];
}

export function setTheme(terminal: Terminal, theme_name: string): void {
  if (theme_name === TERMINAL_AUTO_ID) {
    terminal.options.theme = getAutoTheme();
    return;
  }
  const resolved = theme_name === "cocalc" ? resolveCocalcTheme() : theme_name;
  const t = COLOR_THEMES[getThemeName(resolved)];
  const colors = t.colors;
  if (colors == null) {
    return;
  }
  const theme: ITheme = {
    background: colors[17],
    foreground: colors[16],
    cursor: colors[16],
    cursorAccent: colors[17],
    selectionBackground: "rgba(128, 128, 160, 0.25)",
    black: colors[0],
    red: colors[1],
    green: colors[2],
    yellow: colors[3],
    blue: colors[4],
    magenta: colors[5],
    cyan: colors[6],
    white: colors[7],
    brightBlack: colors[8],
    brightRed: colors[9],
    brightGreen: colors[10],
    brightYellow: colors[11],
    brightBlue: colors[12],
    brightMagenta: colors[13],
    brightCyan: colors[14],
    brightWhite: colors[15],
  };
  terminal.options.theme = theme;
}
