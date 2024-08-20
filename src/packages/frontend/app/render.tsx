/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import ReactDOM from "react-dom";
import { createRoot } from "react-dom/client";

import {
  redux,
  Redux,
  useEffect,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import {
  getLocale,
  Locale,
  LOCALIZATIONS,
  OTHER_SETTINGS_LOCALE_KEY,
} from "@cocalc/frontend/i18n";
import { QueryParams } from "@cocalc/frontend/misc/query-params";
import { AppContext, useAppContextProvider } from "./context";
import { Localize, useLocalizationCtx } from "./localize";

// App uses the context provided by Redux (for the locale, etc.) and Localize.
function App({ children }) {
  const appState = useAppContextProvider();
  const { setLocale } = useLocalizationCtx();
  const other_settings = useTypedRedux("account", "other_settings");

  useEffect(() => {
    const lang = QueryParams.get("lang");
    if (lang != null) {
      if (lang in LOCALIZATIONS) {
        console.warn(
          `URL query parameter 'lang=${lang}' – overriding user configuration.`,
        );
        redux
          .getActions("account")
          .set_other_settings(OTHER_SETTINGS_LOCALE_KEY, lang);
        setLocale(lang);
      } else {
        console.warn(
          `URL query parameter 'lang=${lang}' provided, but not a valid locale.`,
          `Known values: ${Object.keys(LOCALIZATIONS)}`,
        );
      }
    } else {
      const i18n: Locale = getLocale(other_settings);
      setLocale(i18n);
    }
  }, [other_settings]);

  return <AppContext.Provider value={appState}>{children}</AppContext.Provider>;
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

export async function xxx_render(): Promise<void> {
  finishedLoading(); // comment this out to leave the loading/startup banner visible
  const { Page } = await import("./page");
  ReactDOM.render(
    <Root Page={Page} />,
    document.getElementById("cocalc-webapp-container"),
  );
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
