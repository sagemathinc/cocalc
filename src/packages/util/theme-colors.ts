/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
 * Dynamic color theme system for CoCalc.
 *
 * Architecture:
 *   - Only LIGHT theme presets exist (CoCalc, Ocean, Sunset, etc.)
 *   - Dark variants are AUTO-DERIVED from any light theme via deriveDarkTheme()
 *   - A 3-state dark mode toggle (off / system / always) controls derivation
 *   - Terminal and editor schemes auto-resolve based on the active theme's isDark
 *
 * The "default" preset uses CoCalc branding colors (blue + orange).
 */

// ---------------------------------------------------------------------------
// Color math helpers (no external deps)
// ---------------------------------------------------------------------------

/** Parse a hex color (#rgb or #rrggbb) to [r, g, b] in 0–255. */
export function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace("#", "");
  if (h.length === 3) {
    h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  }
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return (
    "#" +
    [clamp(r), clamp(g), clamp(b)]
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("")
  );
}

/** Mix two hex colors; t = 0 → a, t = 1 → b. */
export function mixColors(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return rgbToHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}

/** Lighten a hex color toward white by amount 0–1. */
export function lighten(hex: string, amount: number): string {
  return mixColors(hex, "#ffffff", amount);
}

/** Darken a hex color toward black by amount 0–1. */
export function darken(hex: string, amount: number): string {
  return mixColors(hex, "#000000", amount);
}

/** Compute perceived luminance of a hex color (0 = black, 1 = white). */
export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

// ---------------------------------------------------------------------------
// ColorTheme – the full set of semantic color slots
// ---------------------------------------------------------------------------

export interface ColorTheme {
  /** Human-readable label for the UI */
  name: string;

  /** Whether this is a dark theme (drives antd dark algorithm, CSS variables) */
  isDark?: boolean;

  // ── Brand / primary ──────────────────────────────────────────────────
  primary: string;
  primaryDark: string;
  primaryLight: string;
  primaryLightest: string;

  secondary: string;
  secondaryLight: string;

  // ── Antd token overrides ─────────────────────────────────────────────
  colorLink: string;
  colorSuccess: string;
  colorWarning: string;
  colorError: string;
  colorInfo: string;

  // ── Surfaces ─────────────────────────────────────────────────────────
  bgBase: string;
  bgElevated: string;
  bgHover: string;
  bgSelected: string;

  // ── Text ─────────────────────────────────────────────────────────────
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  textOnPrimary: string;

  // ── Borders ──────────────────────────────────────────────────────────
  border: string;
  borderLight: string;

  // ── Navigation (top bar) ─────────────────────────────────────────────
  topBarBg: string;
  topBarHover: string;
  topBarText: string;
  topBarTextActive: string;

  // ── Project sidebar ──────────────────────────────────────────────────
  sidebarActive: string;
  sidebarOpened: string;

  // ── Landing ──────────────────────────────────────────────────────────
  landingBarBg: string;
  landingTopBg: string;

  // ── Chat ─────────────────────────────────────────────────────────────
  chatViewerBg: string;
  chatViewerText: string;
  chatOtherBg: string;
  chatOtherText: string;

  // ── Misc semantic ────────────────────────────────────────────────────
  star: string;
  run: string;
  aiBg: string;
  aiText: string;
  aiFont: string;
  signInBg: string;
}

// ---------------------------------------------------------------------------
// BaseColors — the minimal set needed to derive a full theme
// ---------------------------------------------------------------------------

export interface BaseColors {
  primary: string;
  secondary: string;
  accent?: string; // optional highlight color (falls back to secondary)
  bg?: string; // page background (default white)
  text?: string; // main text color (default near-black)
}

// ---------------------------------------------------------------------------
// Derive a full LIGHT ColorTheme from base colors
// ---------------------------------------------------------------------------

export function deriveTheme(name: string, base: BaseColors): ColorTheme {
  const {
    primary,
    secondary,
    accent = secondary,
    bg = mixColors("#ffffff", primary, 0.02), // Subtly tint background with primary
    text = "#303030",
  } = base;

  const bgBase = bg;
  const bgElevated = mixColors(bgBase, primary, 0.015); // Slightly more tint for elevated surfaces

  return {
    name,
    isDark: false,

    primary,
    primaryDark: darken(primary, 0.3),
    primaryLight: lighten(primary, 0.4),
    primaryLightest: lighten(primary, 0.85),

    secondary: accent,
    secondaryLight: lighten(accent, 0.6),

    colorLink: darken(primary, 0.15),
    colorSuccess: "#52c41a",
    colorWarning: "#faad14",
    colorError: "#f5222d",
    colorInfo: primary,

    bgBase,
    bgElevated,
    bgHover: darken(bgBase, 0.04),
    bgSelected: lighten(primary, 0.9),

    textPrimary: text,
    textSecondary: lighten(text, 0.35),
    textTertiary: lighten(text, 0.55),
    textOnPrimary: "#ffffff",

    border: lighten(text, 0.7),
    borderLight: lighten(text, 0.82),

    topBarBg: darken(bgBase, 0.07),
    topBarHover: darken(bgBase, 0.04),
    topBarText: lighten(text, 0.35),
    topBarTextActive: text,

    sidebarActive: primary,
    sidebarOpened: darken(primary, 0.3),

    landingBarBg: primary,
    landingTopBg: lighten(primary, 0.75),

    chatViewerBg: lighten(primary, 0.35),
    chatViewerText: "#ffffff",
    chatOtherBg: darken(bgBase, 0.03),
    chatOtherText: text,

    star: "#FFD700",
    run: "#389e0d",
    aiBg: lighten(accent, 0.3),
    aiText: text,
    aiFont: darken(accent, 0.15),
    signInBg: accent,
  };
}

// ---------------------------------------------------------------------------
// Derive a DARK variant from any light ColorTheme
// ---------------------------------------------------------------------------

/**
 * Automatically transform a light theme into its dark counterpart.
 * Preserves the brand colors (primary, secondary) but adjusts surfaces,
 * text, and borders for dark backgrounds.
 */
export function deriveDarkTheme(light: ColorTheme): ColorTheme {
  // Derive dark background from primary color (approx 8-10% primary mixed with near-black)
  const darkBg = mixColors("#050510", light.primary, 0.08);
  const darkBgElevated = lighten(darkBg, 0.08);
  const darkText = "#e0e0e0";

  // Lighten the primary for better visibility on dark backgrounds
  const primary = lighten(light.primary, 0.2);
  const accent = lighten(light.secondary, 0.15);

  return {
    name: `${light.name} (Dark)`,
    isDark: true,

    primary,
    primaryDark: light.primary, // the original is the "dark" shade now
    primaryLight: lighten(primary, 0.3),
    primaryLightest: darken(primary, 0.6),

    secondary: accent,
    secondaryLight: darken(accent, 0.3),

    colorLink: lighten(light.colorLink, 0.3),
    colorSuccess: "#73d13d",
    colorWarning: "#ffc53d",
    colorError: "#ff4d4f",
    colorInfo: primary,

    bgBase: darkBg,
    bgElevated: darkBgElevated,
    bgHover: lighten(darkBg, 0.08),
    bgSelected: darken(primary, 0.7),

    textPrimary: darkText,
    textSecondary: darken(darkText, 0.2),
    textTertiary: darken(darkText, 0.4),
    textOnPrimary: "#ffffff",

    border: lighten(darkBg, 0.2),
    borderLight: lighten(darkBg, 0.12),

    topBarBg: lighten(darkBg, 0.06),
    topBarHover: lighten(darkBg, 0.1),
    topBarText: darken(darkText, 0.3),
    topBarTextActive: darkText,

    sidebarActive: primary,
    sidebarOpened: darken(primary, 0.2),

    landingBarBg: darken(primary, 0.2),
    landingTopBg: darken(primary, 0.5),

    chatViewerBg: darken(primary, 0.3),
    chatViewerText: "#ffffff",
    chatOtherBg: darkBgElevated,
    chatOtherText: darkText,

    star: "#FFD700",
    run: "#52c41a",
    aiBg: darken(accent, 0.4),
    aiText: darkText,
    aiFont: accent,
    signInBg: darken(accent, 0.2),
  };
}

// ---------------------------------------------------------------------------
// Preset themes (light only — dark variants are auto-derived)
// ---------------------------------------------------------------------------

/** Classic CoCalc look — uses the brand colors (blue + orange). */
export const THEME_DEFAULT: ColorTheme = {
  name: "CoCalc",
  isDark: false,

  primary: "#4474c0",
  primaryDark: "#2A5AA6",
  primaryLight: "#80afff",
  primaryLightest: "#e6f4ff",

  secondary: "#fcc861",
  secondaryLight: "#fddc7f",

  colorLink: "#1677ff",
  colorSuccess: "#52c41a",
  colorWarning: "#faad14",
  colorError: "#f5222d",
  colorInfo: "#4474c0",

  bgBase: "#f9fbff", // Subtly tinted blue-white
  bgElevated: "#f6f9ff", // Slightly more tinted for surfaces
  bgHover: "#f0f5ff",
  bgSelected: "#e6f4ff",

  textPrimary: "#303030",
  textSecondary: "#5f5f5f",
  textTertiary: "#808080",
  textOnPrimary: "#ffffff",

  border: "#c0c0c0",
  borderLight: "#eeeeee",

  topBarBg: "#eeeeee",
  topBarHover: "#f5f5f5",
  topBarText: "#808080",
  topBarTextActive: "#434343",

  sidebarActive: "#1677ff",
  sidebarOpened: "#003eb3",

  landingBarBg: "#4474c0",
  landingTopBg: "#c7d9f5",

  chatViewerBg: "#46b1f6",
  chatViewerText: "#ffffff",
  chatOtherBg: "#f8f8f8",
  chatOtherText: "#000000",

  star: "#FFD700",
  run: "#389e0d",
  aiBg: "#f6bf61",
  aiText: "#303030",
  aiFont: "#f0a11d",
  signInBg: "#fbb635",
};

export const THEME_OCEAN: ColorTheme = deriveTheme("Ocean", {
  primary: "#0077b6",
  secondary: "#00b4d8",
  accent: "#90e0ef",
  bg: "#fafcff",
  text: "#1a2b3c",
});

export const THEME_SUNSET: ColorTheme = deriveTheme("Sunset", {
  primary: "#c2452d",
  secondary: "#e8913a",
  accent: "#f0a050",
  bg: "#fffaf6",
  text: "#3a2018",
});

export const THEME_FOREST: ColorTheme = deriveTheme("Forest", {
  primary: "#2d6a4f",
  secondary: "#95d5b2",
  accent: "#74c69d",
  bg: "#f7fcf9",
  text: "#1b3526",
});

export const THEME_LAVENDER: ColorTheme = deriveTheme("Lavender", {
  primary: "#7b2d8e",
  secondary: "#c084fc",
  accent: "#d4a5ff",
  bg: "#fcf9ff",
  text: "#2d1b3a",
});

export const THEME_SLATE: ColorTheme = deriveTheme("Slate", {
  primary: "#475569",
  secondary: "#94a3b8",
  accent: "#64748b",
  bg: "#f8fafc",
  text: "#1e293b",
});

export const THEME_ROSE: ColorTheme = deriveTheme("Rose", {
  primary: "#be185d",
  secondary: "#fb7185",
  accent: "#fda4af",
  bg: "#fff5f7",
  text: "#3b1020",
});

export const THEME_AMBER: ColorTheme = deriveTheme("Amber", {
  primary: "#b45309",
  secondary: "#f59e0b",
  accent: "#fbbf24",
  bg: "#fffbf0",
  text: "#3b2506",
});

export const THEME_MIDNIGHT: ColorTheme = deriveTheme("Midnight", {
  primary: "#3b82f6",
  secondary: "#818cf8",
  accent: "#a5b4fc",
  bg: "#f0f4ff",
  text: "#1e1b4b",
});

// ---------------------------------------------------------------------------
// Registry — light themes only; dark variants are derived on the fly
// ---------------------------------------------------------------------------

export const COLOR_THEMES: Record<string, ColorTheme> = {
  default: THEME_DEFAULT,
  ocean: THEME_OCEAN,
  sunset: THEME_SUNSET,
  forest: THEME_FOREST,
  lavender: THEME_LAVENDER,
  slate: THEME_SLATE,
  rose: THEME_ROSE,
  amber: THEME_AMBER,
  midnight: THEME_MIDNIGHT,
} as const;

export type ColorThemeId = keyof typeof COLOR_THEMES;

/** Safely resolve a theme id, falling back to "default". */
export function getColorTheme(id?: string | null): ColorTheme {
  if (id && id in COLOR_THEMES) {
    return COLOR_THEMES[id];
  }
  return THEME_DEFAULT;
}

/**
 * Build a custom theme from a preset + user base-color overrides.
 * If customBase is provided, we re-derive the theme from those colors,
 * otherwise just return the preset.
 */
export function resolveUserTheme(
  presetId?: string | null,
  customBase?: BaseColors | null,
): ColorTheme {
  if (customBase) {
    return deriveTheme("Custom", customBase);
  }
  return getColorTheme(presetId);
}

/** The setting key stored in other_settings for the color theme id */
export const OTHER_SETTINGS_COLOR_THEME = "color_theme";

/** The setting key for user custom base colors (JSON string of BaseColors) */
export const OTHER_SETTINGS_CUSTOM_THEME_COLORS = "custom_theme_colors";

/**
 * Dark-mode preference for the native theme system.
 * Values: "off" | "on" | "system"
 *   - "off"    → use the selected light theme as-is
 *   - "on"     → always use the dark variant (auto-derived from the light theme)
 *   - "system" → follow prefers-color-scheme media query
 */
export const OTHER_SETTINGS_NATIVE_DARK_MODE = "native_dark_mode";

export type NativeDarkMode = "off" | "on" | "system";
