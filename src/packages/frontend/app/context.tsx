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
  type NativeDarkMode,
  OTHER_SETTINGS_COLOR_THEME,
  OTHER_SETTINGS_CUSTOM_THEME_COLORS,
  OTHER_SETTINGS_NATIVE_DARK_MODE,
  OTHER_SETTINGS_RANDOM_THEME_SEED,
  deriveDarkTheme,
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
  const randomSeed = (other_settings?.get(OTHER_SETTINGS_RANDOM_THEME_SEED) ??
    0) as number;

  return useMemo(() => {
    let customBase: BaseColors | null = null;
    if (customColorsJson) {
      try {
        customBase = JSON.parse(customColorsJson) as BaseColors;
      } catch {
        // ignore
      }
    }
    const lightTheme = resolveUserTheme(themeId, customBase, randomSeed);

    const wantDark =
      nativeDarkMode === "on" ||
      (nativeDarkMode === "system" && systemPrefersDark);

    if (wantDark) {
      return deriveDarkTheme(lightTheme);
    }
    return lightTheme;
  }, [themeId, customColorsJson, nativeDarkMode, systemPrefersDark, randomSeed]);
}

export function useAntdStyleProvider() {
  const other_settings = useTypedRedux("account", "other_settings");
  const rounded = other_settings?.get("antd_rounded", true);
  const animate = other_settings?.get("antd_animate", true);
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

  // Always use the theme's primary color for antd components
  const themeId = other_settings?.get(OTHER_SETTINGS_COLOR_THEME) as
    | string
    | undefined;
  const isCustomTheme = themeId != null && themeId !== "default";
  const primaryColor = isCustomTheme
    ? { colorPrimary: colorTheme.primary }
    : { colorPrimary: COLORS.ANTD_LINK_BLUE };

  // Accessibility: Set all text to pure black for maximum contrast
  // Accessibility: enforce high contrast everywhere
  const a11yTokens = accessibilityEnabled
    ? {
        colorText: "#000000",
        colorTextSecondary: "#000000",
        colorTextTertiary: "#000000",
        colorTextQuaternary: "#000000",
        colorBorder: "#888888",
        colorBorderSecondary: "#aaaaaa",
      }
    : undefined;

  const a11yMenuTokens = accessibilityEnabled
    ? {
        itemSelectedColor: "#000000",
        itemSelectedBg: "#e6e6e6",
        itemColor: "#000000",
        itemHoverColor: "#000000",
        itemHoverBg: "var(--cocalc-bg-hover, #f0f0f0)",
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

  // Theme surface tokens — always derived from the theme
  const surfaceTokens = {
    colorBgBase: colorTheme.bgBase,
    colorBgContainer: colorTheme.bgElevated,
    colorText: colorTheme.textPrimary,
    colorTextSecondary: colorTheme.textSecondary,
    colorTextTertiary: colorTheme.textTertiary,
    colorBorder: colorTheme.border,
    colorBorderSecondary: colorTheme.borderLight,
  };

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
      ...surfaceTokens,
      ...a11yTokens,
    },
    components: {
      Button: {
        ...primaryColor,
      },
      Card: {
        headerBg: colorTheme.topBarBg,
      },
      Collapse: {
        headerBg: colorTheme.topBarBg,
      },
      Table: {
        headerBg: colorTheme.topBarBg,
        headerColor: colorTheme.textPrimary,
        headerSortActiveBg: colorTheme.bgHover,
        headerSortHoverBg: colorTheme.bgHover,
        rowHoverBg: colorTheme.bgHover,
        borderColor: colorTheme.borderLight,
      },
      Menu: {
        itemBorderRadius: 4,
        // Ensure selected menu items have readable text when primary is dark
        itemSelectedColor: colorTheme.isDark
          ? "#ffffff"
          : colorTheme.primary,
        itemSelectedBg: colorTheme.isDark
          ? colorTheme.bgSelected
          : colorTheme.primaryLightest,
        ...(colorTheme.isDark
          ? {
              darkItemBg: colorTheme.bgBase,
              darkItemColor: colorTheme.textSecondary,
              darkItemHoverColor: colorTheme.textPrimary,
              darkItemSelectedBg: colorTheme.bgSelected,
              darkItemSelectedColor: "#ffffff",
              darkSubMenuItemBg: colorTheme.bgBase,
              subMenuItemBg: colorTheme.bgBase,
              // Submenu titles ("Preferences", "Billing") — override primary
              // so open submenu titles match regular item brightness
              colorPrimary: colorTheme.textPrimary,
              itemActiveBg: colorTheme.bgSelected,
            }
          : {}),
        ...a11yMenuTokens,
      },
      ...(colorTheme.isDark
        ? {
            Checkbox: {
              colorBorder: colorTheme.border,
              colorBgContainer: colorTheme.bgElevated,
            },
            Switch: {
              colorTextQuaternary: colorTheme.border,
              colorTextTertiary: colorTheme.textTertiary,
              handleBg: colorTheme.textTertiary,
            },
            Input: {
              colorBgContainer: colorTheme.bgElevated,
              colorBorder: colorTheme.border,
              colorText: colorTheme.textPrimary,
            },
            Tabs: {
              cardBg: colorTheme.topBarBg,
              itemColor: colorTheme.textSecondary,
              itemActiveColor: colorTheme.textPrimary,
              itemSelectedColor: colorTheme.textPrimary,
              inkBarColor: colorTheme.primary,
            },
          }
        : {}),
    },
  };

  return {
    antdTheme,
  };
}

function isNarrow(): boolean {
  return window.innerWidth != null && window.innerWidth <= NARROW_THRESHOLD_PX;
}
