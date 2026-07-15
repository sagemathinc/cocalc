# Dynamic Color Theme System

> **Maintenance note**: Update this file when theme colors, CSS variable
> names, or the dark mode derivation logic change.

## Overview

CoCalc uses a dynamic color theme system that supports light and dark modes.
There is one set of light theme presets; dark variants are automatically
derived from any light theme. Users control dark mode with a 3-state toggle:
**Off**, **System** (follows OS preference), **Always**.

## Architecture

```
                    ┌──────────────────────┐
                    │   theme-colors.ts    │  (packages/util)
                    │  ColorTheme type     │
                    │  deriveTheme()       │  light themes from BaseColors
                    │  deriveDarkTheme()   │  auto-dark from any light theme
                    │  COLOR_THEMES        │  preset registry
                    └─────────┬────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
    ┌─────────────────┐ ┌───────────┐ ┌────────────────┐
    │ theme-context.tsx│ │ context.tsx│ │  render.tsx     │
    │ useColorTheme() │ │ antd theme│ │ CSS variables   │
    │ useResolvedColor│ │ tokens    │ │ on <html>       │
    │ Theme()         │ │           │ │ setDarkModeState│
    └─────────────────┘ └───────────┘ └────────────────┘
              │                               │
              │        React components       │    SASS / CSS
              │        read from context      │    reads CSS vars
              ▼                               ▼
    ┌─────────────────────────────────────────────────┐
    │          UI: buttons, panels, editors, chat      │
    │  inline styles use: var(--cocalc-*, ${COLORS.X}) │
    │  SASS uses: var(--cocalc-*, colors.$COL_X)       │
    └─────────────────────────────────────────────────┘
```

## Key Files

| File                                                 | Purpose                                                                            |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `packages/util/theme-colors.ts`                      | `ColorTheme` interface, `deriveTheme()`, `deriveDarkTheme()`, preset registry      |
| `packages/util/theme.ts`                             | Re-exports theme-colors; legacy `COLORS` object with static hex values             |
| `packages/frontend/app/theme-context.tsx`            | React context (`useColorTheme()`), resolves user settings + system dark preference |
| `packages/frontend/app/context.tsx`                  | Ant Design `ConfigProvider` theme tokens derived from active `ColorTheme`          |
| `packages/frontend/app/render.tsx`                   | Injects `--cocalc-*` CSS custom properties on `<html>`, syncs `setDarkModeState()` |
| `packages/frontend/_colors.sass`                     | SASS bridge: maps `$COL_*` / `$THEME_*` to `var(--cocalc-*, fallback)`             |
| `packages/frontend/account/color-theme-selector.tsx` | UI: theme picker + dark mode toggle                                                |
| `packages/frontend/account/dark-mode.ts`             | Minimal state tracker (`inDarkMode()` / `setDarkModeState()`)                      |
| `packages/util/db-schema/accounts.ts`                | Persisted settings: `color_theme`, `custom_theme_colors`, `native_dark_mode`       |

## How It Works

### 1. Theme Resolution

The user picks a light theme preset (or defines custom base colors). The
`useResolvedColorTheme()` hook in `theme-context.tsx` resolves the effective
theme:

```
user settings ──► resolveUserTheme(presetId, customBase)
                        │
                        ▼
                   light ColorTheme
                        │
              ┌─────────┴─────────┐
              │ dark mode wanted? │
              └─────────┬─────────┘
                   yes  │  no
                   ▼    │  ▼
          deriveDarkTheme()  return light theme
```

Dark mode is wanted when `native_dark_mode` is `"on"`, or `"system"` and the
OS reports `prefers-color-scheme: dark`.

### 2. CSS Custom Properties

`render.tsx` writes the resolved theme as `--cocalc-*` properties on
`document.documentElement` (`<html>`). This is the bridge between the React theme context and
CSS/SASS. Any style — inline or SASS — can reference these variables:

```typescript
// TypeScript inline style (always use COLORS.* as fallback)
background: `var(--cocalc-bg-elevated, ${COLORS.GRAY_LLLL})`

// SASS (uses _colors.sass variables which already wrap CSS vars)
background-color: colors.$COL_GRAY_LLLL
// which expands to: var(--cocalc-bg-elevated, #fafafa)
```

### 3. Ant Design Integration

`context.tsx` maps the `ColorTheme` to Ant Design's `ThemeConfig`:

- When dark: enables `theme.darkAlgorithm` + sets `colorBgBase`,
  `colorBgContainer`, `colorText`, `colorBorder` tokens
- Component-level overrides for `Table`, `Tabs`, `Menu`, `Checkbox`,
  `Switch`, `Input` ensure consistent dark mode

### 4. Terminal & Editor Auto-switching

Terminal and CodeMirror editor schemes have a virtual `"cocalc"` option that
resolves to `"cocalc-light"` or `"cocalc-dark"` based on the current theme's
`isDark` flag. The resolution happens in:

- `frame-editors/terminal-editor/resolve-color-scheme.ts`
- `frame-editors/codemirror/resolve-editor-scheme.ts`

The terminal component (`terminal.tsx`) uses `useColorTheme()` to re-render
and re-apply the xterm theme when dark mode changes.

## CSS Variable Reference

All set on `document.documentElement` by `render.tsx`:

| Variable                       | Slot                      | Example (light) | Example (dark) |
| ------------------------------ | ------------------------- | --------------- | -------------- |
| `--cocalc-bg-base`             | Page background           | `#ffffff`       | `#0a0e1e`      |
| `--cocalc-bg-elevated`         | Cards, modals, inputs     | `#fafafa`       | `#161a29`      |
| `--cocalc-bg-hover`            | Hover / subtle highlight  | `#f5f5f5`       | `#1e2130`      |
| `--cocalc-bg-selected`         | Selected / info highlight | `#e6f4ff`       | `#202b3e`      |
| `--cocalc-text-primary`        | Body text                 | `#303030`       | `#e0e0e0`      |
| `--cocalc-text-secondary`      | Secondary text            | `#5f5f5f`       | `#b3b3b3`      |
| `--cocalc-text-tertiary`       | Placeholder / disabled    | `#808080`       | `#888888`      |
| `--cocalc-text-muted`          | Muted helper text         | `#808080`       | `#888888`      |
| `--cocalc-text-on-primary`     | Text on primary bg        | `#ffffff`       | `#ffffff`      |
| `--cocalc-border`              | Default border            | `#c0c0c0`       | `#383848`      |
| `--cocalc-border-light`        | Subtle border             | `#eeeeee`       | `#2a2a3a`      |
| `--cocalc-top-bar-bg`          | Nav bar background        | `#eeeeee`       | `#191c2c`      |
| `--cocalc-top-bar-hover`       | Nav hover                 | `#f5f5f5`       | `#232635`      |
| `--cocalc-top-bar-text`        | Nav text                  | `#808080`       | `#9e9eb3`      |
| `--cocalc-top-bar-text-active` | Active nav text           | `#434343`       | `#e0e0e0`      |
| `--cocalc-primary`             | Brand primary             | `#4474c0`       | `#6d93cc`      |
| `--cocalc-primary-dark`        | Darker primary            | `#2A5AA6`       | `#4474c0`      |
| `--cocalc-primary-light`       | Lighter primary           | `#80afff`       | `#97bfdb`      |
| `--cocalc-primary-lightest`    | Very light primary        | `#c7d9f5`       | `#2b3a52`      |
| `--cocalc-secondary`           | Brand secondary           | `#fcc861`       | `#fdd580`      |
| `--cocalc-drag-bar`            | Drag bar default          | `#e0e0e0`       | `#2e3040`      |
| `--cocalc-drag-bar-hover`      | Drag bar hover/active     | `#4474c0`       | `#6d93cc`      |
| `--cocalc-ai-bg`               | AI assistant button bg    | `#f6bf61`       | `#977d49`      |
| `--cocalc-ai-text`             | AI assistant text         | `#303030`       | `#e0e0e0`      |
| `--cocalc-chat-viewer-bg`      | Own chat bubble           | `#46b1f6`       | `#4a6590`      |
| `--cocalc-chat-other-bg`       | Other chat bubble         | `#f8f8f8`       | `#1e2130`      |
| `--cocalc-success`             | Success green             | `#52c41a`       | `#73d13d`      |
| `--cocalc-warning`             | Warning amber             | `#faad14`       | `#ffc53d`      |
| `--cocalc-error`               | Error red                 | `#f5222d`       | `#ff4d4f`      |
| `--cocalc-error-light`         | Error-tinted background   | `#fff2f0`       | `#3c171b`      |
| `--cocalc-link`                | Link color                | `#1677ff`       | `#4d9eff`      |
| `--cocalc-run`                 | Run button green          | `#389e0d`       | `#52c41a`      |
| `--cocalc-star`                | Star gold                 | `#FFD700`       | `#FFD700`      |

## Adding a New Semantic Color

1. Add the field to `ColorTheme` interface in `theme-colors.ts`
2. Set values in `deriveTheme()` (light), `deriveDarkTheme()`, and `THEME_DEFAULT`
3. Add `s.setProperty("--cocalc-<name>", t.<field>)` in `render.tsx`
4. Use in components: `` `var(--cocalc-<name>, ${COLORS.<FALLBACK>})` ``
5. Optionally add to `_colors.sass` if SASS files need it

## Conventions

- **Inline styles**: Always use `COLORS.*` constants as CSS var fallbacks,
  never hardcoded hex strings:
  ```typescript
  // Good
  background: `var(--cocalc-bg-elevated, ${COLORS.GRAY_LLLL})`;
  // Bad
  background: "var(--cocalc-bg-elevated, #fafafa)";
  ```
- **SASS**: `_colors.sass` variables already wrap CSS vars — just use
  `colors.$COL_*` and dark mode works automatically
- **Ant Design**: Use component tokens in `context.tsx` rather than CSS
  overrides when possible
- **New components**: Use `useColorTheme()` hook for reactive access to the
  full `ColorTheme` object when CSS vars aren't sufficient

## Theme Presets

All presets are light-only; dark variants are derived automatically:

| ID         | Name     | Primary          | Secondary        |
| ---------- | -------- | ---------------- | ---------------- |
| `default`  | CoCalc   | `#4474c0` (blue) | `#fcc861` (gold) |
| `ocean`    | Ocean    | `#0077b6`        | `#00b4d8`        |
| `sunset`   | Sunset   | `#c2452d`        | `#e8913a`        |
| `forest`   | Forest   | `#2d6a4f`        | `#95d5b2`        |
| `lavender` | Lavender | `#7b2d8e`        | `#c084fc`        |
| `slate`    | Slate    | `#475569`        | `#94a3b8`        |
| `rose`     | Rose     | `#be185d`        | `#fb7185`        |
| `amber`    | Amber    | `#b45309`        | `#f59e0b`        |
| `midnight` | Midnight | `#3b82f6`        | `#818cf8`        |

## User Settings (in `other_settings`)

| Key                   | Type                        | Default     | Description                |
| --------------------- | --------------------------- | ----------- | -------------------------- |
| `color_theme`         | `string`                    | `"default"` | Preset theme ID            |
| `custom_theme_colors` | `string`                    | `""`        | JSON `BaseColors` override |
| `native_dark_mode`    | `"off" \| "on" \| "system"` | `"off"`     | Dark mode preference       |
