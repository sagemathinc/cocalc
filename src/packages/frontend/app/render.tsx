/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { createRoot } from "react-dom/client";
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
import { AppContext, useAppContextProvider } from "./context";
import { Localize, useLocalizationCtx } from "./localize";

// App uses the context provided by Redux (for the locale, etc.) and Localize.
function App({ children }) {
  const appState = useAppContextProvider();
  const { setLocale } = useLocalizationCtx();
  const other_settings = useTypedRedux("account", "other_settings");

  // setting via ?lang=[locale] takes precedece over account settings
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

  return (
    <AppContext.Provider
      value={{ ...appState, ...timeAgo }}
    >
      {children}
    </AppContext.Provider>
  );
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
