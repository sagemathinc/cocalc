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
  deriveAccessibilityTheme,
  hexToRgb,
  lighten,
  mixColors,
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

  // Check accessibility mode
  let accessibilityEnabled = false;
  try {
    const a11yStr = other_settings?.get(A11Y);
    if (a11yStr) accessibilityEnabled = JSON.parse(a11yStr).enabled ?? false;
  } catch {
    // ignore
  }
  const effectiveColorTheme = accessibilityEnabled
    ? deriveAccessibilityTheme(colorTheme)
    : colorTheme;

  // Sync the resolved theme to CSS custom properties on <body> so that
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

/** Write a ColorTheme's key fields as --cocalc-* CSS custom properties on document.body.
 *  When accessibility mode is on, override text/border variables for maximum contrast. */
function applyThemeCSSVars(t: ColorTheme, a11y: boolean = false): void {
  const s = document.body.style;
  const topBarActive = a11y
    ? mixColors(t.topBarBg, t.bgSelected, t.isDark ? 0.7 : 0.85)
    : mixColors(t.topBarBg, t.bgElevated, t.isDark ? 0.55 : 0.85);

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

  const setRgb = (name: string, hex: string) => {
    try {
      const [r, g, b] = hexToRgb(hex);
      s.setProperty(`${name}-rgb`, `${r}, ${g}, ${b}`);
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

  s.setProperty("--cocalc-bg-base", t.bgBase);
  setRgb("--cocalc-bg-base", t.bgBase);
  s.setProperty("--cocalc-bg-elevated", t.bgElevated);
  s.setProperty("--cocalc-bg-hover", t.bgHover);
  s.setProperty("--cocalc-bg-selected", t.bgSelected);
  s.setProperty("--cocalc-text-primary", textPrimary);
  s.setProperty("--cocalc-text-primary-strong", t.textPrimaryStrong);
  s.setProperty("--cocalc-text-secondary", textSecondary);
  s.setProperty("--cocalc-text-tertiary", textTertiary);
  s.setProperty("--cocalc-text-on-primary", t.textOnPrimary);
  s.setProperty("--cocalc-border", border);
  s.setProperty("--cocalc-border-light", borderLight);
  s.setProperty("--cocalc-top-bar-bg", t.topBarBg);
  s.setProperty("--cocalc-top-bar-active", topBarActive);
  s.setProperty("--cocalc-top-bar-hover", t.topBarHover);
  s.setProperty("--cocalc-top-bar-text", topBarText);
  s.setProperty("--cocalc-top-bar-text-active", topBarTextActive);
  s.setProperty("--cocalc-editor-titlebar-bg", editorTitlebarBg);
  s.setProperty("--cocalc-editor-titlebar-bg-active", editorTitlebarActive);
  s.setProperty("--cocalc-primary", t.primary);
  setRgb("--cocalc-primary", t.primary);
  s.setProperty("--cocalc-primary-dark", t.primaryDark);
  s.setProperty("--cocalc-primary-light", t.primaryLight);
  s.setProperty("--cocalc-primary-lightest", t.primaryLightest);
  s.setProperty("--cocalc-secondary", t.secondary);
  s.setProperty("--cocalc-secondary-light", t.secondaryLight);
  s.setProperty("--cocalc-success", t.colorSuccess);
  setRgb("--cocalc-success", t.colorSuccess);
  s.setProperty("--cocalc-warning", t.colorWarning);
  setRgb("--cocalc-warning", t.colorWarning);
  s.setProperty("--cocalc-error", t.colorError);
  setRgb("--cocalc-error", t.colorError);
  s.setProperty("--cocalc-info", t.colorInfo);
  s.setProperty("--cocalc-link", t.colorLink);
  s.setProperty("--cocalc-run", t.run);
  setRgb("--cocalc-run", t.run);
  s.setProperty("--cocalc-star", t.star);
  s.setProperty("--cocalc-drag-bar", t.dragBar);
  s.setProperty("--cocalc-drag-bar-hover", t.dragBarHover);
  s.setProperty("--cocalc-ai-bg", t.aiBg);
  s.setProperty("--cocalc-ai-text", t.aiText);
  s.setProperty("--cocalc-ai-font", t.aiFont);
  s.setProperty("--cocalc-chat-viewer-bg", t.chatViewerBg);
  s.setProperty("--cocalc-chat-other-bg", t.chatOtherBg);
  // Syntax highlighting
  s.setProperty("--cocalc-syntax-keyword", t.syntaxKeyword);
  s.setProperty("--cocalc-syntax-string", t.syntaxString);
  s.setProperty("--cocalc-syntax-comment", t.syntaxComment);
  s.setProperty("--cocalc-syntax-number", t.syntaxNumber);
  s.setProperty("--cocalc-syntax-function", t.syntaxFunction);
  s.setProperty("--cocalc-syntax-variable", t.syntaxVariable);
  s.setProperty("--cocalc-syntax-type", t.syntaxType);
  s.setProperty("--cocalc-syntax-operator", t.syntaxOperator);
  s.setProperty("--cocalc-is-dark", t.isDark ? "1" : "0");
  // Also set body background so the page chrome matches the theme
  s.backgroundColor = t.bgBase;
  s.color = textPrimary;
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
