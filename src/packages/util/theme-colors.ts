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

import sha1 from "sha1";

// ---------------------------------------------------------------------------
// Color math helpers (no external deps)
// ---------------------------------------------------------------------------

/** Parse a color string (#rgb, #rrggbb, or rgb(r,g,b)) to [r, g, b] in 0–255. */
export function hexToRgb(color: string): [number, number, number] {
  // Handle rgb(r, g, b) format (as emitted by antd ColorPicker)
  const rgbMatch = color.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
  if (rgbMatch) {
    return [parseInt(rgbMatch[1]), parseInt(rgbMatch[2]), parseInt(rgbMatch[3])];
  }
  let h = color.replace("#", "");
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

  // ── Drag bars ────────────────────────────────────────────────────────
  dragBar: string;
  dragBarHover: string;

  // ── Syntax highlighting (for auto editor/terminal themes) ────────────
  syntaxKeyword: string; // control flow, statements (if, for, def, class)
  syntaxString: string; // string literals
  syntaxComment: string; // comments
  syntaxNumber: string; // numeric literals, constants
  syntaxFunction: string; // function/method names
  syntaxVariable: string; // variables, default code text
  syntaxType: string; // types, classes, tags
  syntaxOperator: string; // operators, punctuation

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

/** Return white or near-black depending on which has better contrast. */
function contrastText(bgHex: string): string {
  return luminance(bgHex) > 0.55 ? "#222222" : "#ffffff";
}

export function deriveTheme(name: string, base: BaseColors): ColorTheme {
  const {
    primary,
    secondary,
    accent = secondary,
    bg = mixColors("#ffffff", primary, 0.02), // Subtly tint background with primary
    text = "#303030",
  } = base;

  const bgBase = bg;
  const bgElevated = mixColors(bgBase, primary, 0.015);
  const chatViewerBg = lighten(primary, 0.35);

  return {
    name,
    isDark: false,

    primary,
    primaryDark: darken(primary, 0.3),
    primaryLight: lighten(primary, 0.4),
    primaryLightest: lighten(primary, 0.85),

    secondary,
    secondaryLight: lighten(secondary, 0.6),

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
    textOnPrimary: contrastText(primary),

    border: lighten(text, 0.7),
    borderLight: lighten(text, 0.82),

    topBarBg: mixColors(darken(bgBase, 0.07), primary, 0.1),
    topBarHover: mixColors(darken(bgBase, 0.04), primary, 0.05),
    topBarText: lighten(text, 0.35),
    topBarTextActive: text,

    sidebarActive: primary,
    sidebarOpened: darken(primary, 0.3),

    landingBarBg: primary,
    landingTopBg: lighten(primary, 0.75),

    chatViewerBg,
    chatViewerText: contrastText(chatViewerBg),
    chatOtherBg: darken(bgBase, 0.03),
    chatOtherText: text,

    dragBar: darken(bg, 0.1),
    dragBarHover: primary,

    // Syntax highlighting — derived from theme colors for light backgrounds
    syntaxKeyword: darken(primary, 0.15),
    syntaxString: darken(secondary, 0.2),
    syntaxComment: lighten(text, 0.45),
    syntaxNumber: darken(accent, 0.2),
    syntaxFunction: darken(primary, 0.05),
    syntaxVariable: text,
    syntaxType: mixColors(primary, secondary, 0.5),
    syntaxOperator: lighten(text, 0.2),

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

    dragBar: lighten(darkBg, 0.15),
    dragBarHover: primary,

    // Syntax highlighting — lightened for dark backgrounds
    syntaxKeyword: lighten(light.syntaxKeyword, 0.35),
    syntaxString: lighten(light.syntaxString, 0.3),
    syntaxComment: darken(darkText, 0.35),
    syntaxNumber: lighten(light.syntaxNumber, 0.3),
    syntaxFunction: lighten(light.syntaxFunction, 0.3),
    syntaxVariable: darkText,
    syntaxType: lighten(light.syntaxType, 0.35),
    syntaxOperator: darken(darkText, 0.15),

    star: "#FFD700",
    run: "#52c41a",
    aiBg: darken(accent, 0.4),
    aiText: darkText,
    aiFont: accent,
    signInBg: darken(accent, 0.2),
  };
}

// ---------------------------------------------------------------------------
// Randomized daily theme — deterministic colors that change every day
// ---------------------------------------------------------------------------

/**
 * Hash a string to extract an integer, then map it to a value in [min, max].
 * Channel index (0=R, 1=G, 2=B) picks different bits from the hash.
 */
function hashToChannel(
  seed: string,
  channel: number,
  min: number,
  max: number,
): number {
  const hash = sha1(seed)
    .split("")
    .reduce((a, b) => ((a << 6) - a + b.charCodeAt(0)) | 0, 0);
  const raw = ((hash >> (channel * 8)) & 0xff) % (max - min);
  return raw + min;
}

function hashToHex(seed: string, min: number, max: number): string {
  const r = hashToChannel(seed, 0, min, max);
  const g = hashToChannel(seed, 1, min, max);
  const b = hashToChannel(seed, 2, min, max);
  return rgbToHex(r, g, b);
}

/**
 * Compute the minimum pairwise "distance" between a set of hex colors.
 * Uses sum of absolute channel differences (Manhattan distance in RGB).
 */
function colorDiversity(colors: string[]): number {
  let minDist = Infinity;
  for (let i = 0; i < colors.length; i++) {
    for (let j = i + 1; j < colors.length; j++) {
      const [r1, g1, b1] = hexToRgb(colors[i]);
      const [r2, g2, b2] = hexToRgb(colors[j]);
      const dist = Math.abs(r1 - r2) + Math.abs(g1 - g2) + Math.abs(b1 - b2);
      minDist = Math.min(minDist, dist);
    }
  }
  return minDist;
}

/**
 * Generate BaseColors for the "Randomized" theme from a numeric seed.
 * The seed is persisted in user account settings and incremented on each click.
 *
 * - primary:   vibrant, saturated (R,G,B each in 40–200, with high channel diff)
 * - secondary: vibrant, distinct from primary
 * - accent:    lighter variant, distinct from both
 * - bg:        very light grayish (245–255 per channel)
 * - text:      dark grayish (30–60 per channel)
 *
 * A diversity sub-seed (0, 1, 2, …) is incremented until pairwise distance
 * between primary, secondary, and accent exceeds a threshold.
 */
export function generateRandomizedBaseColors(seed: number = 0): BaseColors {
  const MIN_DIVERSITY = 180; // minimum Manhattan RGB distance between any two chromatic colors

  for (let divSeed = 0; divSeed <= 100; divSeed++) {
    const s = `cocalc-random-theme-${seed}-${divSeed}`;
    // Primary: medium-saturated, not too bright, not too dark
    const primary = hashToHex(`${s}-primary`, 40, 200);
    // Secondary: same range, different hash input
    const secondary = hashToHex(`${s}-secondary`, 40, 200);
    // Accent: lighter range
    const accent = hashToHex(`${s}-accent`, 100, 220);

    if (colorDiversity([primary, secondary, accent]) >= MIN_DIVERSITY) {
      // bg: very light, slight random tint
      const bg = hashToHex(`${s}-bg`, 245, 255);
      // text: dark but with subtle color tint (wider range lets channels diverge)
      const text = hashToHex(`${s}-text`, 15, 75);
      return { primary, secondary, accent, bg, text };
    }
  }
  // Fallback (should never happen with these ranges)
  return {
    primary: "#4474c0",
    secondary: "#fcc861",
    accent: "#fcc861",
    bg: "#f9fbff",
    text: "#303030",
  };
}

// ---------------------------------------------------------------------------
// Preset themes (light only — dark variants are auto-derived)
// ---------------------------------------------------------------------------

/** Classic CoCalc look — uses the brand colors (blue + orange). */
export const THEME_DEFAULT: ColorTheme = deriveTheme("CoCalc", {
  primary: "#4474c0",
  secondary: "#fcc861",
  accent: "#fbb635",
  bg: "#f9fbff",
  text: "#303030",
});

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

export const THEME_GRAYSCALE: ColorTheme = {
  ...deriveTheme("Grayscale", {
    primary: "#555555",
    secondary: "#888888",
    accent: "#999999",
    bg: "#f5f5f5",
    text: "#222222",
  }),
  // Override all chromatic slots with gray equivalents
  colorSuccess: "#6b6b6b",
  colorWarning: "#8a8a8a",
  colorError: "#4a4a4a",
  colorInfo: "#555555",
  colorLink: "#444444",
  star: "#999999",
  run: "#555555",
  aiBg: "#e0e0e0",
  aiFont: "#555555",
  signInBg: "#777777",
};

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
  grayscale: THEME_GRAYSCALE,
} as const;

/** Base colors for each preset — used to seed the custom editor. */
export const PRESET_BASE_COLORS: Record<string, BaseColors> = {
  default: {
    primary: "#4474c0",
    secondary: "#fcc861",
    accent: "#fcc861",
    bg: "#f9fbff",
    text: "#303030",
  },
  ocean: { primary: "#0077b6", secondary: "#00b4d8", accent: "#90e0ef", bg: "#fafcff", text: "#1a2b3c" },
  sunset: { primary: "#c2452d", secondary: "#e8913a", accent: "#f0a050", bg: "#fffaf6", text: "#3a2018" },
  forest: { primary: "#2d6a4f", secondary: "#95d5b2", accent: "#74c69d", bg: "#f7fcf9", text: "#1b3526" },
  lavender: { primary: "#7b2d8e", secondary: "#c084fc", accent: "#d4a5ff", bg: "#fcf9ff", text: "#2d1b3a" },
  slate: { primary: "#475569", secondary: "#94a3b8", accent: "#64748b", bg: "#f8fafc", text: "#1e293b" },
  rose: { primary: "#be185d", secondary: "#fb7185", accent: "#fda4af", bg: "#fff5f7", text: "#3b1020" },
  amber: { primary: "#b45309", secondary: "#f59e0b", accent: "#fbbf24", bg: "#fffbf0", text: "#3b2506" },
  midnight: { primary: "#3b82f6", secondary: "#818cf8", accent: "#a5b4fc", bg: "#f0f4ff", text: "#1e1b4b" },
  grayscale: { primary: "#555555", secondary: "#888888", accent: "#999999", bg: "#f5f5f5", text: "#222222" },
};

/** ID for the randomized daily theme (not in COLOR_THEMES since it's dynamic) */
export const THEME_RANDOMIZED_ID = "randomized";

/** ID for the user's custom theme (base colors stored separately in other_settings) */
export const THEME_CUSTOM_ID = "custom";

/** Generate the randomized theme on the fly from a persisted seed. */
export function getRandomizedTheme(seed: number = 0): ColorTheme {
  return deriveTheme("Randomized", generateRandomizedBaseColors(seed));
}

/** The setting key for the randomized theme seed (number, stored in other_settings) */
export const OTHER_SETTINGS_RANDOM_THEME_SEED = "random_theme_seed";

export type ColorThemeId = keyof typeof COLOR_THEMES;

/** Safely resolve a theme id, falling back to "default". */
export function getColorTheme(
  id?: string | null,
  randomSeed?: number,
): ColorTheme {
  if (id === THEME_RANDOMIZED_ID) {
    return getRandomizedTheme(randomSeed ?? 0);
  }
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
  presetId: string | null | undefined,
  customBase: BaseColors | null | undefined,
  randomSeed: number,
): ColorTheme {
  if (presetId === THEME_CUSTOM_ID && customBase) {
    return deriveTheme("Custom", customBase);
  }
  return getColorTheme(presetId, randomSeed);
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
