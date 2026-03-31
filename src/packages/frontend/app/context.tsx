/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { theme, ThemeConfig } from "antd";
import { debounce } from "lodash";
import { ReactNode, useEffect, useMemo, useState } from "react";
import { useIntl } from "react-intl";

import { useTypedRedux } from "@cocalc/frontend/app-framework";
import { IntlMessage, isIntlMessage } from "@cocalc/frontend/i18n";
import { ACTIVITY_BAR_LABELS } from "@cocalc/frontend/project/page/activity-bar-consts";
import { A11Y } from "@cocalc/util/consts/ui";
import {
  type BaseColors,
  COLORS,
  type ColorTheme,
  LIGHT_TO_DARK_MAP,
  type NativeDarkMode,
  OTHER_SETTINGS_COLOR_THEME,
  OTHER_SETTINGS_CUSTOM_THEME_COLORS,
  OTHER_SETTINGS_NATIVE_DARK_MODE,
  getColorTheme,
  resolveUserTheme,
} from "@cocalc/util/theme";
import { NARROW_THRESHOLD_PX, PageStyle } from "./top-nav-consts";
import useAppContext, { AppContext, AppState, calcStyle } from "./use-context";

export { AppContext, useAppContext };

export function useAppContextProvider(): AppState {
  const intl = useIntl();
  const other_settings = useTypedRedux("account", "other_settings");
  const showActBarLabels = other_settings.get(ACTIVITY_BAR_LABELS) ?? true;

  const [pageWidthPx, setPageWidthPx] = useState<number>(window.innerWidth);

  const [narrow, setNarrow] = useState<boolean>(isNarrow());

  function update() {
    setNarrow(isNarrow());
    if (window.innerWidth != pageWidthPx) {
      setPageWidthPx(window.innerWidth);
    }
  }

  useEffect(() => {
    const handleResize = debounce(update, 50, {
      leading: false,
      trailing: true,
    });

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // avoid updating the style on every resize event
  const pageStyle: PageStyle = useMemo(() => {
    return calcStyle(narrow);
  }, [narrow]);

  function formatIntl(
    msg: IntlMessage | ReactNode | string,
  ): ReactNode | string {
    if (isIntlMessage(msg)) {
      return intl.formatMessage(msg);
    } else {
      return msg;
    }
  }

  function displayI18N(
    label: string | IntlMessage | ReactNode,
  ): string | ReactNode {
    if (isIntlMessage(label)) {
      return intl.formatMessage(label);
    } else {
      return label;
    }
  }

  return {
    formatIntl,
    displayI18N,
    pageWidthPx,
    pageStyle,
    showActBarLabels,
  };
}

/** Listen to prefers-color-scheme media query for "system" dark mode. */
function useSystemDarkPreference(): boolean {
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
 * Resolve the effective ColorTheme from Redux other_settings,
 * including native dark-mode preference and system detection.
 */
function useResolvedColorThemeForAntd(): ColorTheme {
  const other_settings = useTypedRedux("account", "other_settings");
  const systemPrefersDark = useSystemDarkPreference();

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
        // ignore
      }
    }
    const baseTheme = resolveUserTheme(themeId, customBase);

    const wantDark =
      nativeDarkMode === "on" ||
      (nativeDarkMode === "system" && systemPrefersDark);

    if (wantDark && !baseTheme.isDark) {
      const effectiveId = themeId ?? "default";
      const darkId = LIGHT_TO_DARK_MAP[effectiveId] ?? "dark";
      return getColorTheme(darkId);
    }
    return baseTheme;
  }, [themeId, customColorsJson, nativeDarkMode, systemPrefersDark]);
}

export function useAntdStyleProvider() {
  const other_settings = useTypedRedux("account", "other_settings");
  const rounded = other_settings?.get("antd_rounded", true);
  const animate = other_settings?.get("antd_animate", true);
  const branded = other_settings?.get("antd_brandcolors", false);
  const compact = other_settings?.get("antd_compact", false);

  const colorTheme = useResolvedColorThemeForAntd();

  // Parse accessibility settings
  const accessibilityStr = other_settings?.get(A11Y);
  let accessibilityEnabled = false;
  if (accessibilityStr) {
    try {
      const accessibilitySettings = JSON.parse(accessibilityStr);
      accessibilityEnabled = accessibilitySettings.enabled ?? false;
    } catch {
      // Ignore parse errors
    }
  }

  const borderStyle = rounded
    ? undefined
    : { borderRadius: 0, borderRadiusLG: 0, borderRadiusSM: 0 };

  const animationStyle = animate ? undefined : { motion: false };

  // Use theme-derived primary color; fall back to antd default when not branded
  const themeId = other_settings?.get(OTHER_SETTINGS_COLOR_THEME) as
    | string
    | undefined;
  const isCustomTheme = themeId != null && themeId !== "default";
  const primaryColor =
    isCustomTheme || branded
      ? { colorPrimary: colorTheme.primary }
      : { colorPrimary: COLORS.ANTD_LINK_BLUE };

  // Accessibility: Set all text to pure black for maximum contrast
  const accessibilityTextColor = accessibilityEnabled
    ? {
        colorText: "#000000",
        colorTextSecondary: "#000000",
        colorTextTertiary: "#000000",
        colorTextQuaternary: "#000000",
      }
    : undefined;

  // Build the antd algorithm list: dark + compact as needed
  const algorithms: Array<typeof theme.darkAlgorithm> = [];
  if (colorTheme.isDark) {
    algorithms.push(theme.darkAlgorithm);
  }
  if (compact) {
    algorithms.push(theme.compactAlgorithm);
  }
  const algorithmConfig =
    algorithms.length > 0 ? { algorithm: algorithms } : undefined;

  // Dark theme surface tokens
  const darkTokens = colorTheme.isDark
    ? {
        colorBgBase: colorTheme.bgBase,
        colorBgContainer: colorTheme.bgElevated,
        colorText: colorTheme.textPrimary,
        colorTextSecondary: colorTheme.textSecondary,
        colorTextTertiary: colorTheme.textTertiary,
        colorBorder: colorTheme.border,
        colorBorderSecondary: colorTheme.borderLight,
      }
    : undefined;

  const antdTheme: ThemeConfig = {
    ...algorithmConfig,
    token: {
      colorLink: colorTheme.colorLink,
      colorTextLightSolid: colorTheme.textOnPrimary,
      colorTextDescription: colorTheme.textSecondary,
      colorSuccess: colorTheme.colorSuccess,
      colorWarning: colorTheme.colorWarning,
      colorError: colorTheme.colorError,
      colorInfo: colorTheme.colorInfo,
      ...primaryColor,
      ...borderStyle,
      ...animationStyle,
      ...darkTokens,
      ...accessibilityTextColor,
    },
    components: {
      Button: {
        ...primaryColor,
      },
    },
  };

  return {
    antdTheme,
  };
}

function isNarrow(): boolean {
  return window.innerWidth != null && window.innerWidth <= NARROW_THRESHOLD_PX;
}
