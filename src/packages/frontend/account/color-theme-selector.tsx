/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/**
 * Color theme selector for the appearance settings panel.
 *
 * Architecture:
 *   - Only light theme presets exist; dark variants are auto-derived
 *   - Dark mode toggle (off / system / always) controls derivation
 *   - Custom base-color editor for power users
 */

import {
  ColorPicker as AntdColorPicker,
  Button,
  Card,
  Divider,
  Segmented,
  Tag,
} from "antd";
import { CSSProperties, useCallback, useMemo, useState } from "react";
import { FormattedMessage, defineMessages, useIntl } from "react-intl";

import { redux, useTypedRedux } from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components";
import { labels } from "@cocalc/frontend/i18n";
import { Panel } from "@cocalc/frontend/antd-bootstrap";
import { COLORS } from "@cocalc/util/theme";
import {
  type BaseColors,
  COLOR_THEMES,
  type ColorTheme,
  type NativeDarkMode,
  OTHER_SETTINGS_COLOR_THEME,
  OTHER_SETTINGS_CUSTOM_THEME_COLORS,
  OTHER_SETTINGS_NATIVE_DARK_MODE,
  OTHER_SETTINGS_RANDOM_THEME_SEED,
  THEME_RANDOMIZED_ID,
  deriveDarkTheme,
  deriveTheme,
  getColorTheme,
  getRandomizedTheme,
} from "@cocalc/util/theme";

const MESSAGES = defineMessages({
  title: {
    id: "account.appearance.color_theme.title",
    defaultMessage: "Color Theme",
  },
  customTitle: {
    id: "account.appearance.color_theme.custom.title",
    defaultMessage: "Custom Colors",
  },
  customDescription: {
    id: "account.appearance.color_theme.custom.description",
    defaultMessage:
      "Define your own base colors. All other colors are derived automatically.",
  },
  primaryLabel: {
    id: "account.appearance.color_theme.custom.primary",
    defaultMessage: "Primary",
  },
  secondaryLabel: {
    id: "account.appearance.color_theme.custom.secondary",
    defaultMessage: "Secondary",
  },
  accentLabel: {
    id: "account.appearance.color_theme.custom.accent",
    defaultMessage: "Accent",
  },
  bgLabel: {
    id: "account.appearance.color_theme.custom.bg",
    defaultMessage: "Background",
  },
  textLabel: {
    id: "account.appearance.color_theme.custom.text",
    defaultMessage: "Text",
  },
  customizeButton: {
    id: "account.appearance.color_theme.customize",
    defaultMessage: "Customize",
  },
  previewLabel: {
    id: "account.appearance.color_theme.preview",
    defaultMessage: "Preview",
  },
  nativeDarkLabel: {
    id: "account.appearance.color_theme.native_dark",
    defaultMessage: "Dark Mode",
  },
  nativeDarkOff: {
    id: "account.appearance.color_theme.native_dark.off",
    defaultMessage: "Off",
  },
  nativeDarkOn: {
    id: "account.appearance.color_theme.native_dark.on",
    defaultMessage: "Always",
  },
  nativeDarkSystem: {
    id: "account.appearance.color_theme.native_dark.system",
    defaultMessage: "System",
  },
  nativeDarkDescription: {
    id: "account.appearance.color_theme.native_dark.description",
    defaultMessage:
      "Automatically derives a dark variant from the selected theme. 'System' follows your OS light/dark preference. Editor and terminal themes switch automatically.",
  },
  themes: {
    id: "account.appearance.color_theme.themes",
    defaultMessage: "Themes",
  },
});

function onChangeSetting(name: string, value: any): void {
  redux.getActions("account").set_other_settings(name, value);
}

// ── Swatch: a tiny preview of a theme ─────────────────────────────────

function ThemeSwatch({
  theme,
  style,
}: {
  theme: ColorTheme;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: 2,
        alignItems: "center",
        ...style,
      }}
    >
      {[
        theme.primary,
        theme.secondary,
        theme.textPrimary,
        theme.colorSuccess,
        theme.colorWarning,
        theme.colorError,
      ].map((c, i) => (
        <div
          key={i}
          style={{
            width: 12,
            height: 12,
            borderRadius: 2,
            background: c,
            border: "1px solid rgba(0,0,0,0.08)",
          }}
        />
      ))}
    </div>
  );
}

// ── Theme card (clickable) ────────────────────────────────────────────

function ThemeCard({
  theme,
  active,
  onClick,
}: {
  id: string;
  theme: ColorTheme;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Card
      size="small"
      hoverable
      onClick={onClick}
      style={{
        border: active ? `2px solid ${theme.primary}` : "2px solid transparent",
        cursor: "pointer",
      }}
      styles={{
        body: { padding: "6px 8px" },
      }}
    >
      <div
        style={{ fontWeight: active ? 600 : 400, marginBottom: 3, fontSize: 12 }}
      >
        {theme.name}
      </div>
      <ThemeSwatch theme={theme} />
    </Card>
  );
}

// ── Full preview bar ──────────────────────────────────────────────────

function ThemePreview({ theme }: { theme: ColorTheme }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 0,
        borderRadius: 6,
        overflow: "hidden",
        height: 32,
        border: "1px solid rgba(0,0,0,0.1)",
        marginTop: 8,
      }}
    >
      {[
        { bg: theme.primary, label: "Primary" },
        { bg: theme.primaryDark, label: "Pri Dark" },
        { bg: theme.secondary, label: "Secondary" },
        { bg: theme.signInBg, label: "Accent" },
        { bg: theme.aiBg, label: "AI" },
        { bg: theme.colorLink, label: "Link" },
        { bg: theme.colorSuccess, label: "OK" },
        { bg: theme.colorWarning, label: "Warn" },
        { bg: theme.colorError, label: "Error" },
        { bg: theme.topBarBg, label: "Nav" },
        { bg: theme.sidebarActive, label: "Sidebar" },
        { bg: theme.bgBase, label: "BG" },
        { bg: theme.border, label: "Border" },
        { bg: theme.textPrimary, label: "Text" },
      ].map(({ bg, label }, i) => (
        <div
          key={i}
          title={`${label}: ${bg}`}
          style={{
            flex: 1,
            background: bg,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 11,
            color: luma(bg) > 0.55 ? "#333" : "#fff",
            fontWeight: 500,
          }}
        >
          {label}
        </div>
      ))}
    </div>
  );
}

function luma(hex: string): number {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16) / 255;
  const g = parseInt(h.substring(2, 4), 16) / 255;
  const b = parseInt(h.substring(4, 6), 16) / 255;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

// ── Custom base-color editor ──────────────────────────────────────────

const DEFAULT_CUSTOM: BaseColors = {
  primary: "#4474c0",
  secondary: "#fcc861",
  accent: "#fcc861",
  bg: "#ffffff",
  text: "#303030",
};

function CustomColorEditor({
  value,
  onChange,
}: {
  value: BaseColors;
  onChange: (v: BaseColors) => void;
}) {
  const intl = useIntl();

  const fields: {
    key: "primary" | "secondary" | "accent" | "bg" | "text";
    label: string;
  }[] = [
    { key: "primary", label: intl.formatMessage(MESSAGES.primaryLabel) },
    { key: "secondary", label: intl.formatMessage(MESSAGES.secondaryLabel) },
    { key: "accent", label: intl.formatMessage(MESSAGES.accentLabel) },
    { key: "bg", label: intl.formatMessage(MESSAGES.bgLabel) },
    { key: "text", label: intl.formatMessage(MESSAGES.textLabel) },
  ];

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
      {fields.map(({ key, label }) => (
        <div key={key} style={{ textAlign: "center" }}>
          <div style={{ fontSize: 12, marginBottom: 4 }}>{label}</div>
          <AntdColorPicker
            value={value[key] ?? (DEFAULT_CUSTOM[key] as string)}
            onChange={(_, hex) => onChange({ ...value, [key]: hex as string })}
            size="small"
          />
        </div>
      ))}
    </div>
  );
}

// ── Randomized theme card with animated rainbow border ───────────────

const RAINBOW_KEYFRAMES = `
@keyframes cocalc-rainbow-border {
  0%   { border-color: #ff6b6b; box-shadow: 0 0 8px #ff6b6b44; }
  16%  { border-color: #ffa500; box-shadow: 0 0 8px #ffa50044; }
  33%  { border-color: #ffd700; box-shadow: 0 0 8px #ffd70044; }
  50%  { border-color: #51cf66; box-shadow: 0 0 8px #51cf6644; }
  66%  { border-color: #339af0; box-shadow: 0 0 8px #339af044; }
  83%  { border-color: #9775fa; box-shadow: 0 0 8px #9775fa44; }
  100% { border-color: #ff6b6b; box-shadow: 0 0 8px #ff6b6b44; }
}
`;

function RandomizedThemeCard({
  active,
  seed,
  onClick,
  onChangeSeed,
}: {
  active: boolean;
  seed: number;
  onClick: () => void;
  onChangeSeed: (seed: number) => void;
}) {
  const theme = useMemo(() => getRandomizedTheme(seed), [seed]);

  return (
    <>
      <style>{RAINBOW_KEYFRAMES}</style>
      <div style={{ display: "flex", gap: 0 }}>
        <Card
          size="small"
          hoverable
          onClick={onClick}
          style={{
            border: active
              ? `2px solid ${theme.primary}`
              : "2px solid transparent",
            cursor: "pointer",
            flex: 1,
            borderTopRightRadius: active ? 0 : undefined,
            borderBottomRightRadius: active ? 0 : undefined,
            animation: active
              ? "cocalc-rainbow-border 4s linear infinite"
              : undefined,
          }}
          styles={{
            body: { padding: "6px 8px" },
          }}
        >
          <div
            style={{
              fontWeight: active ? 600 : 400,
              marginBottom: 3,
              fontSize: 12,
              background:
                "linear-gradient(90deg, #ff6b6b, #ffa500, #ffd700, #51cf66, #339af0, #9775fa)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            Randomized
          </div>
          <ThemeSwatch theme={theme} />
        </Card>
        {active && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "stretch",
            }}
          >
            <Button
              size="small"
              style={{
                flex: 1,
                borderTopLeftRadius: 0,
                borderBottomLeftRadius: 0,
                borderBottomRightRadius: 0,
                borderLeft: 0,
                fontSize: 11,
                padding: "0 6px",
                minWidth: 24,
              }}
              onClick={(e) => {
                e.stopPropagation();
                onChangeSeed(seed + 1);
              }}
            >
              +
            </Button>
            <Button
              size="small"
              style={{
                flex: 1,
                borderTopLeftRadius: 0,
                borderBottomLeftRadius: 0,
                borderTopRightRadius: 0,
                borderLeft: 0,
                fontSize: 11,
                padding: "0 6px",
                minWidth: 24,
              }}
              onClick={(e) => {
                e.stopPropagation();
                onChangeSeed(Math.max(0, seed - 1));
              }}
            >
              -
            </Button>
          </div>
        )}
      </div>
    </>
  );
}

// ── Main selector component ───────────────────────────────────────────

export function ColorThemeSelector() {
  const intl = useIntl();
  const other_settings = useTypedRedux("account", "other_settings");

  const currentThemeId = String(
    other_settings?.get(OTHER_SETTINGS_COLOR_THEME) ?? "default",
  );
  const customColorsJson = other_settings?.get(
    OTHER_SETTINGS_CUSTOM_THEME_COLORS,
  )
    ? String(other_settings.get(OTHER_SETTINGS_CUSTOM_THEME_COLORS))
    : undefined;
  const nativeDarkMode = String(
    other_settings?.get(OTHER_SETTINGS_NATIVE_DARK_MODE) ?? "off",
  ) as NativeDarkMode;
  const randomSeed = Number(
    other_settings?.get(OTHER_SETTINGS_RANDOM_THEME_SEED) ?? 0,
  );

  const [showCustom, setShowCustom] = useState(!!customColorsJson);

  const customBase: BaseColors = useMemo(() => {
    if (customColorsJson) {
      try {
        return { ...DEFAULT_CUSTOM, ...JSON.parse(customColorsJson) };
      } catch {
        // ignore
      }
    }
    return DEFAULT_CUSTOM;
  }, [customColorsJson]);

  // Resolve the effective theme (including dark mode derivation)
  const activeTheme = useMemo(() => {
    let lightTheme: ColorTheme;
    if (customColorsJson) {
      try {
        lightTheme = deriveTheme("Custom", JSON.parse(customColorsJson));
      } catch {
        lightTheme = getColorTheme(currentThemeId, randomSeed);
      }
    } else {
      lightTheme = getColorTheme(currentThemeId, randomSeed);
    }

    // Show the dark preview when dark mode is on
    const wantDark =
      nativeDarkMode === "on" ||
      (nativeDarkMode === "system" &&
        typeof window !== "undefined" &&
        window.matchMedia?.("(prefers-color-scheme: dark)").matches);

    return wantDark ? deriveDarkTheme(lightTheme) : lightTheme;
  }, [currentThemeId, customColorsJson, nativeDarkMode, randomSeed]);

  const handleSelectPreset = useCallback((id: string) => {
    onChangeSetting(OTHER_SETTINGS_COLOR_THEME, id);
    onChangeSetting(OTHER_SETTINGS_CUSTOM_THEME_COLORS, "");
    setShowCustom(false);
  }, []);

  const handleCustomChange = useCallback((base: BaseColors) => {
    onChangeSetting(OTHER_SETTINGS_CUSTOM_THEME_COLORS, JSON.stringify(base));
  }, []);

  const handleReset = useCallback(() => {
    onChangeSetting(OTHER_SETTINGS_COLOR_THEME, "default");
    onChangeSetting(OTHER_SETTINGS_CUSTOM_THEME_COLORS, "");
    onChangeSetting(OTHER_SETTINGS_NATIVE_DARK_MODE, "off");
    setShowCustom(false);
  }, []);

  const isDefault =
    currentThemeId === "default" &&
    !customColorsJson &&
    nativeDarkMode === "off";

  const themes = Object.entries(COLOR_THEMES);

  return (
    <Panel
      size="small"
      header={
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>
            <Icon name="colors" /> {intl.formatMessage(MESSAGES.title)}
            {!isDefault && (
              <Tag color={activeTheme.primary} style={{ marginLeft: 8 }}>
                {activeTheme.name}
              </Tag>
            )}
          </span>
          <Button size="small" onClick={handleReset}>
            {intl.formatMessage(labels.reset)}
          </Button>
        </div>
      }
    >
      {/* Dark mode — 3-state toggle */}
      <div style={{ marginBottom: 12 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 6,
          }}
        >
          <strong>{intl.formatMessage(MESSAGES.nativeDarkLabel)}</strong>
          <Segmented
            size="small"
            value={nativeDarkMode}
            onChange={(val) =>
              onChangeSetting(OTHER_SETTINGS_NATIVE_DARK_MODE, val)
            }
            options={[
              {
                label: intl.formatMessage(MESSAGES.nativeDarkOff),
                value: "off",
              },
              {
                label: intl.formatMessage(MESSAGES.nativeDarkSystem),
                value: "system",
              },
              {
                label: intl.formatMessage(MESSAGES.nativeDarkOn),
                value: "on",
              },
            ]}
          />
        </div>
        <div style={{ fontSize: 12, color: COLORS.GRAY }}>
          {intl.formatMessage(MESSAGES.nativeDarkDescription)}
        </div>
      </div>

      <Divider style={{ margin: "8px 0" }} />

      {/* Theme presets */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {themes.map(([id, theme]) => (
          <ThemeCard
            key={id}
            id={id}
            theme={theme}
            active={!customColorsJson && currentThemeId === id}
            onClick={() => handleSelectPreset(id)}
          />
        ))}
        <RandomizedThemeCard
          active={!customColorsJson && currentThemeId === THEME_RANDOMIZED_ID}
          seed={randomSeed}
          onClick={() => handleSelectPreset(THEME_RANDOMIZED_ID)}
          onChangeSeed={(s) =>
            onChangeSetting(OTHER_SETTINGS_RANDOM_THEME_SEED, s)
          }
        />
      </div>

      {/* Live preview bar */}
      <ThemePreview theme={activeTheme} />

      {/* Custom color editor toggle */}
      <div style={{ marginTop: 12 }}>
        <Button
          size="small"
          type={showCustom ? "primary" : "default"}
          onClick={() => setShowCustom(!showCustom)}
          icon={<Icon name="colors" />}
        >
          {intl.formatMessage(MESSAGES.customizeButton)}
        </Button>
      </div>

      {showCustom && (
        <Card size="small" style={{ marginTop: 8 }}>
          <div style={{ marginBottom: 8, color: COLORS.GRAY_M, fontSize: 12 }}>
            <FormattedMessage {...MESSAGES.customDescription} />
          </div>
          <CustomColorEditor value={customBase} onChange={handleCustomChange} />
          {customColorsJson && <ThemePreview theme={activeTheme} />}
        </Card>
      )}
    </Panel>
  );
}
