/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/**
 * Color theme selector for the appearance settings panel.
 *
 * Lets users:
 *   1. Pick from preset themes (with live swatches)
 *   2. Toggle a "custom" mode where they choose base colors and the
 *      full theme is derived automatically
 *   3. Always shows a reset button
 */

import {
  ColorPicker as AntdColorPicker,
  Button,
  Card,
  Col,
  Divider,
  Row,
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
  deriveTheme,
  getColorTheme,
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
    defaultMessage: "Native Dark Mode",
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
      "Switches the UI color theme natively. 'System' follows your OS light/dark preference automatically. This also switches the editor and terminal to a matching CoCalc style. The Dark Reader option below is a separate legacy overlay.",
  },
  lightThemes: {
    id: "account.appearance.color_theme.light_themes",
    defaultMessage: "Light Themes",
  },
  darkThemes: {
    id: "account.appearance.color_theme.dark_themes",
    defaultMessage: "Dark Themes",
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
        theme.primaryDark,
        theme.secondary,
        theme.colorSuccess,
        theme.colorWarning,
        theme.colorError,
      ].map((c, i) => (
        <div
          key={i}
          style={{
            width: 14,
            height: 14,
            borderRadius: 3,
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
        minWidth: 130,
      }}
      styles={{
        body: { padding: "8px 10px" },
      }}
    >
      <div style={{ fontWeight: active ? 600 : 400, marginBottom: 4 }}>
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
        height: 28,
        border: "1px solid rgba(0,0,0,0.1)",
        marginTop: 8,
      }}
    >
      {[
        { bg: theme.primary, label: "Pri" },
        { bg: theme.primaryDark, label: "Dark" },
        { bg: theme.primaryLight, label: "Light" },
        { bg: theme.secondary, label: "Sec" },
        { bg: theme.colorLink, label: "Link" },
        { bg: theme.colorSuccess, label: "OK" },
        { bg: theme.colorWarning, label: "Warn" },
        { bg: theme.colorError, label: "Err" },
        { bg: theme.topBarBg, label: "Nav" },
        { bg: theme.chatViewerBg, label: "Chat" },
        { bg: theme.aiBg, label: "AI" },
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
            fontSize: 9,
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

  const activeTheme = useMemo(() => {
    if (customColorsJson) {
      try {
        return deriveTheme("Custom", JSON.parse(customColorsJson));
      } catch {
        // ignore
      }
    }
    return getColorTheme(currentThemeId);
  }, [currentThemeId, customColorsJson]);

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

  // Split themes into light and dark groups
  const lightThemes = Object.entries(COLOR_THEMES).filter(([, t]) => !t.isDark);
  const darkThemes = Object.entries(COLOR_THEMES).filter(([, t]) => t.isDark);

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
      {/* Native dark mode — 3-state slider */}
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

      {/* Light themes */}
      <div style={{ fontWeight: 500, marginBottom: 6 }}>
        {intl.formatMessage(MESSAGES.lightThemes)}
      </div>
      <Row gutter={[8, 8]}>
        {lightThemes.map(([id, theme]) => (
          <Col key={id} xs={12} sm={8} md={6}>
            <ThemeCard
              id={id}
              theme={theme}
              active={!customColorsJson && currentThemeId === id}
              onClick={() => handleSelectPreset(id)}
            />
          </Col>
        ))}
      </Row>

      <Divider style={{ margin: "10px 0 8px" }} />

      {/* Dark themes */}
      <div style={{ fontWeight: 500, marginBottom: 6 }}>
        {intl.formatMessage(MESSAGES.darkThemes)}
      </div>
      <Row gutter={[8, 8]}>
        {darkThemes.map(([id, theme]) => (
          <Col key={id} xs={12} sm={8} md={6}>
            <ThemeCard
              id={id}
              theme={theme}
              active={!customColorsJson && currentThemeId === id}
              onClick={() => handleSelectPreset(id)}
            />
          </Col>
        ))}
      </Row>

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
