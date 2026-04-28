/*
 *  This file is part of CoCalc: Copyright © 2020-2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { useEffect } from "react";

import {
  redux,
  Redux,
  useAsyncEffect,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import {
  getLocale,
  LOCALIZATIONS,
  OTHER_SETTINGS_LOCALE_KEY,
} from "@cocalc/frontend/i18n";
import { QueryParams } from "@cocalc/frontend/misc/query-params";
import { setDarkModeState } from "@cocalc/frontend/account/dark-mode";
import { A11Y } from "@cocalc/util/consts/ui";
import {
  adjustThemeIntensity,
  deriveAccessibilityTheme,
  hexToRgb,
  LEGACY_OTHER_SETTINGS_THEME_BRIGHTNESS,
  lighten,
  mixColors,
  OTHER_SETTINGS_THEME_INTENSITY,
  normalizeThemeIntensity,
  type ColorTheme,
} from "@cocalc/util/theme";
import { createRoot } from "react-dom/client";
import { AppContext, useAppContextProvider } from "./context";
import { Localize, useLocalizationCtx } from "./localize";
import { ThemeContext, useResolvedColorTheme } from "./theme-context";

// App uses the context provided by Redux (for the locale, etc.) and Localize.
function App({ children }) {
  const appState = useAppContextProvider();
  const { setLocale } = useLocalizationCtx();
  const other_settings = useTypedRedux("account", "other_settings");
  const themeIntensityPreview = useTypedRedux(
    "account",
    "theme_intensity_preview",
  );

  // setting via ?lang=[locale] takes precedence over account settings
  // additionally ?lang_temp=[locale] temporarily changes it, used by these impersonation admin links
  useAsyncEffect(async () => {
    const lang_set = QueryParams.get("lang");
    // lang_temp sets the language *temporarily*, i.e. without changing the account settings and it is sticky
    // this is useful for impersonation – https://github.com/sagemathinc/cocalc/issues/7782
    const lang_temp = QueryParams.get("lang_temp");
    const temp = lang_temp != null;
    const lang = temp ? lang_temp : lang_set;
    if (lang != null) {
      if (lang in LOCALIZATIONS) {
        console.warn(
          `URL query parameter 'lang=${lang}' – overriding user configuration ${
            temp ? "temporary" : "permanent"
          }.`,
        );
        if (!temp) {
          const store = redux.getStore("account");
          // we have to ensure the account store is available, because this code runs very early
          await store.async_wait({
            until: () => store.get_account_id() != null,
          });
          redux
            .getActions("account")
            .set_other_settings(OTHER_SETTINGS_LOCALE_KEY, lang);
        }
        setLocale(lang);
      } else {
        console.warn(
          `URL query parameter '${JSON.stringify({
            lang_set,
            lang_temp,
          })}' provided, but not a valid locale.`,
          `Known values: ${Object.keys(LOCALIZATIONS)}`,
        );
      }
      if (!temp) {
        // removing the parameter, otherwise this conflicts with further changes of account settings
        QueryParams.remove("lang");
      }
    } else {
      setLocale(getLocale(other_settings));
    }
  }, [getLocale(other_settings)]);

  const timeAgo = {
    timeAgoAbsolute: other_settings.get("time_ago_absolute"),
    setTimeAgoAbsolute: (absolute: boolean) => {
      redux
        .getActions("account")
        .set_other_settings("time_ago_absolute", absolute);
    },
  };

  const colorTheme = useResolvedColorTheme();
  const themeIntensity =
    themeIntensityPreview != null
      ? normalizeThemeIntensity(themeIntensityPreview)
      : normalizeThemeIntensity(
          other_settings?.get(OTHER_SETTINGS_THEME_INTENSITY),
          other_settings?.get(LEGACY_OTHER_SETTINGS_THEME_BRIGHTNESS),
        );

  // Check accessibility mode
  let accessibilityEnabled = false;
  try {
    const a11yStr = other_settings?.get(A11Y);
    if (a11yStr) accessibilityEnabled = JSON.parse(a11yStr).enabled ?? false;
  } catch {
    // ignore
  }
  const effectiveColorTheme = adjustThemeIntensity(
    accessibilityEnabled ? deriveAccessibilityTheme(colorTheme) : colorTheme,
    themeIntensity,
  );

  // Sync the resolved theme to CSS custom properties on <html> so that
  // SASS / plain CSS can also respond to theme changes (e.g. top bar, borders).
  useEffect(() => {
    applyThemeCSSVars(effectiveColorTheme, accessibilityEnabled);
  }, [effectiveColorTheme, accessibilityEnabled]);

  return (
    <ThemeContext.Provider value={effectiveColorTheme}>
      <AppContext.Provider value={{ ...appState, ...timeAgo }}>
        {children}
      </AppContext.Provider>
    </ThemeContext.Provider>
  );
}

/** Write a ColorTheme's key fields as --cocalc-* CSS custom properties on document.documentElement.
 *  When accessibility mode is on, override text/border variables for maximum contrast. */
function applyThemeCSSVars(t: ColorTheme, a11y: boolean = false): void {
  const rootStyle = document.documentElement.style;
  const bodyStyle = document.body.style;
  // Editor title bar backgrounds — three tiers of brightness:
  //   topBarBg (darkest) < editorTitlebarBg (inactive) < editorTitlebarActive (active)
  // In dark mode the dark surfaces are very close together, so we lighten
  // from topBarBg directly to create visible separation.
  const editorTitlebarBg = t.isDark
    ? lighten(t.topBarBg, 0.08)
    : mixColors(t.topBarBg, "#ffffff", 0.4);
  const editorTitlebarActive = t.isDark
    ? lighten(t.topBarBg, 0.16)
    : mixColors(t.topBarBg, "#ffffff", 0.7);
  const topBarActive =
    a11y && !t.isDark
      ? t.bgElevated
      : a11y
        ? mixColors(t.topBarBg, t.bgSelected, 0.7)
        : t.isDark
          ? editorTitlebarActive
          : mixColors(t.topBarBg, t.bgElevated, 0.85);
  const errorLight = mixColors(t.bgBase, t.colorError, t.isDark ? 0.2 : 0.08);
  const chromePrimaryBg = t.isDark
    ? mixColors(editorTitlebarActive, t.primary, 0.42)
    : t.primary;
  const chromePrimaryBgHover = t.isDark
    ? mixColors(editorTitlebarActive, t.primary, 0.48)
    : t.primaryDark;
  const chromePrimaryText = t.isDark ? t.textPrimaryStrong : t.textOnPrimary;
  const chromeSuccessBg = t.isDark
    ? mixColors(t.topBarBg, t.colorSuccess, 0.6)
    : t.colorSuccess;
  const chromeSuccessBgHover = t.isDark
    ? mixColors(t.topBarBg, t.colorSuccess, 0.66)
    : mixColors(t.colorSuccess, "#000000", 0.08);
  const chromeSuccessText = t.isDark ? t.textPrimaryStrong : t.textOnPrimary;

  const setRgb = (name: string, hex: string) => {
    try {
      const [r, g, b] = hexToRgb(hex);
      rootStyle.setProperty(`${name}-rgb`, `${r}, ${g}, ${b}`);
    } catch {
      // ignore
    }
  };

  const textPrimary = t.textPrimary;
  const textSecondary = t.textSecondary;
  const textTertiary = t.textTertiary;
  const border = t.border;
  const borderLight = t.borderLight;
  const topBarText = t.topBarText;
  const topBarTextActive = t.topBarTextActive;

  rootStyle.setProperty("color-scheme", t.isDark ? "dark" : "light");
  rootStyle.setProperty("--cocalc-bg-base", t.bgBase);
  setRgb("--cocalc-bg-base", t.bgBase);
  rootStyle.setProperty("--cocalc-bg-elevated", t.bgElevated);
  rootStyle.setProperty("--cocalc-bg-hover", t.bgHover);
  rootStyle.setProperty("--cocalc-bg-selected", t.bgSelected);
  rootStyle.setProperty("--cocalc-text-primary", textPrimary);
  rootStyle.setProperty("--cocalc-text-primary-strong", t.textPrimaryStrong);
  rootStyle.setProperty("--cocalc-text-secondary", textSecondary);
  rootStyle.setProperty("--cocalc-text-tertiary", textTertiary);
  rootStyle.setProperty("--cocalc-text-muted", textTertiary);
  rootStyle.setProperty("--cocalc-text-on-primary", t.textOnPrimary);
  rootStyle.setProperty("--cocalc-border", border);
  rootStyle.setProperty("--cocalc-border-light", borderLight);
  rootStyle.setProperty("--cocalc-top-bar-bg", t.topBarBg);
  rootStyle.setProperty("--cocalc-top-bar-active", topBarActive);
  rootStyle.setProperty("--cocalc-top-bar-hover", t.topBarHover);
  rootStyle.setProperty("--cocalc-top-bar-text", topBarText);
  rootStyle.setProperty("--cocalc-top-bar-text-active", topBarTextActive);
  rootStyle.setProperty("--cocalc-editor-titlebar-bg", editorTitlebarBg);
  rootStyle.setProperty(
    "--cocalc-editor-titlebar-bg-active",
    editorTitlebarActive,
  );
  rootStyle.setProperty("--cocalc-primary", t.primary);
  setRgb("--cocalc-primary", t.primary);
  rootStyle.setProperty("--cocalc-primary-dark", t.primaryDark);
  rootStyle.setProperty("--cocalc-primary-light", t.primaryLight);
  rootStyle.setProperty("--cocalc-primary-lightest", t.primaryLightest);
  rootStyle.setProperty("--cocalc-secondary", t.secondary);
  rootStyle.setProperty("--cocalc-secondary-light", t.secondaryLight);
  rootStyle.setProperty("--cocalc-success", t.colorSuccess);
  setRgb("--cocalc-success", t.colorSuccess);
  rootStyle.setProperty("--cocalc-warning", t.colorWarning);
  setRgb("--cocalc-warning", t.colorWarning);
  rootStyle.setProperty("--cocalc-error", t.colorError);
  setRgb("--cocalc-error", t.colorError);
  rootStyle.setProperty("--cocalc-error-light", errorLight);
  rootStyle.setProperty("--cocalc-info", t.colorInfo);
  rootStyle.setProperty("--cocalc-link", t.colorLink);
  rootStyle.setProperty("--cocalc-chrome-primary-bg", chromePrimaryBg);
  rootStyle.setProperty(
    "--cocalc-chrome-primary-bg-hover",
    chromePrimaryBgHover,
  );
  rootStyle.setProperty("--cocalc-chrome-primary-text", chromePrimaryText);
  rootStyle.setProperty("--cocalc-chrome-success-bg", chromeSuccessBg);
  rootStyle.setProperty(
    "--cocalc-chrome-success-bg-hover",
    chromeSuccessBgHover,
  );
  rootStyle.setProperty("--cocalc-chrome-success-text", chromeSuccessText);
  rootStyle.setProperty("--cocalc-run", t.run);
  setRgb("--cocalc-run", t.run);
  rootStyle.setProperty("--cocalc-star", t.star);
  rootStyle.setProperty("--cocalc-drag-bar", t.dragBar);
  rootStyle.setProperty("--cocalc-drag-bar-hover", t.dragBarHover);
  rootStyle.setProperty("--cocalc-ai-bg", t.aiBg);
  rootStyle.setProperty("--cocalc-ai-text", t.aiText);
  rootStyle.setProperty("--cocalc-ai-font", t.aiFont);
  rootStyle.setProperty("--cocalc-chat-viewer-bg", t.chatViewerBg);
  rootStyle.setProperty("--cocalc-chat-other-bg", t.chatOtherBg);
  // Syntax highlighting
  rootStyle.setProperty("--cocalc-syntax-keyword", t.syntaxKeyword);
  rootStyle.setProperty("--cocalc-syntax-string", t.syntaxString);
  rootStyle.setProperty("--cocalc-syntax-comment", t.syntaxComment);
  rootStyle.setProperty("--cocalc-syntax-number", t.syntaxNumber);
  rootStyle.setProperty("--cocalc-syntax-function", t.syntaxFunction);
  rootStyle.setProperty("--cocalc-syntax-variable", t.syntaxVariable);
  rootStyle.setProperty("--cocalc-syntax-type", t.syntaxType);
  rootStyle.setProperty("--cocalc-syntax-operator", t.syntaxOperator);
  rootStyle.setProperty("--cocalc-is-dark", t.isDark ? "1" : "0");
  // Also set body background so the page chrome matches the theme
  bodyStyle.backgroundColor = t.bgBase;
  bodyStyle.color = textPrimary;
  // Keep the dark mode state tracker in sync
  setDarkModeState(!!t.isDark);
}

function Root({ Page }) {
  return (
    <Redux>
      <Localize>
        <App>
          <Page />
        </App>
      </Localize>
    </Redux>
  );
}

export async function render(): Promise<void> {
  finishedLoading(); // comment this out to leave the loading/startup banner visible so you can use the Chrome dev tools with it.
  const container = document.getElementById("cocalc-webapp-container");
  const root = createRoot(container!);
  const { Page } = await import("./page");
  root.render(<Root Page={Page} />);
}

// When loading is done, remove any visible artifacts.
// This doesn't remove anything added to the head.
function finishedLoading() {
  const load = document.getElementById("cocalc-load-container");
  if (load != null) {
    load.innerHTML = "";
    load.remove();
  }
}
