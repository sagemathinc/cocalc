/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { useEffect } from "react";

import "vanilla-cookieconsent/dist/cookieconsent.css";

import {
  redux,
  Redux,
  useAsyncEffect,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import {
  ConsentSnapshot,
  enableForceConsent,
  hasEssentialConsent,
  onConsentChange,
  restoreConsentCookieFromSnapshot,
} from "@cocalc/frontend/cookie-consent";
import { initCookieConsent } from "@cocalc/frontend/cookie-consent/init";
import {
  getLocale,
  LOCALIZATIONS,
  OTHER_SETTINGS_LOCALE_KEY,
} from "@cocalc/frontend/i18n";
import { QueryParams } from "@cocalc/frontend/misc/query-params";
import { createRoot } from "react-dom/client";
import { AppContext, useAppContextProvider } from "./context";
import { Localize, useLocalizationCtx } from "./localize";

// App uses the context provided by Redux (for the locale, etc.) and Localize.
function App({ children }) {
  const appState = useAppContextProvider();
  const { setLocale } = useLocalizationCtx();
  const other_settings = useTypedRedux("account", "other_settings");
  const customizeReady = useTypedRedux("customize", "_is_configured");
  const cookieBannerEnabled = useTypedRedux(
    "customize",
    "cookie_banner_enabled",
  );
  const cookieBannerText = useTypedRedux("customize", "cookie_banner_text");

  useEffect(() => {
    if (!customizeReady) return;
    let cancelled = false;
    let timer: number | undefined;
    const accountStore = redux.getStore("account");

    const proceed = () => {
      if (cancelled) return;
      // For signed-in users with a stored consent snapshot in their account,
      // synthesise the cc_cookie from that record before v3 reads it. The
      // server-side consent log is authoritative; the browser cookie is
      // just runtime state that legitimately gets cleared (private mode,
      // browser data wipe, new device). Re-prompting in those cases is
      // redundant since we already have approval on file.
      //
      // We do NOT gate on `is_logged_in` here: that flag flips in a
      // separate code path (`signed_in` event → wait for table.connected →
      // set_user_type("signed_in")) that races with the AccountTable's
      // first-sync `is_ready` emit. is_logged_in can still be false at the
      // moment is_ready fires, even though other_settings.cookie_consent
      // is already populated from the same first-sync setState. Reading
      // cookie_consent directly is the more reliable signal — anonymous
      // visitors won't have it.
      if (cookieBannerEnabled) {
        const stored: any = accountStore.getIn([
          "other_settings",
          "cookie_consent",
        ]);
        if (stored != null && typeof stored?.toJS === "function") {
          restoreConsentCookieFromSnapshot(stored.toJS() as ConsentSnapshot);
        }
      }
      initCookieConsent({
        enabled: !!cookieBannerEnabled,
        textMarkdown: cookieBannerText,
      });
    };

    if (accountStore.get("is_ready")) {
      proceed();
    } else {
      // Wait for the account table to load (so we can look at
      // other_settings.cookie_consent), with a short fallback timeout for
      // anonymous visitors who never trigger the is_ready event.
      let done = false;
      const onReady = () => {
        if (done) return;
        done = true;
        if (timer != null) window.clearTimeout(timer);
        proceed();
      };
      accountStore.once("is_ready", onReady);
      timer = window.setTimeout(() => {
        if (done) return;
        done = true;
        accountStore.removeListener("is_ready", onReady);
        proceed();
      }, 2000);
    }

    return () => {
      cancelled = true;
      if (timer != null) window.clearTimeout(timer);
    };
  }, [customizeReady, cookieBannerEnabled, cookieBannerText]);

  // SSO fallback: a successful SSO callback can drop a logged-in user on
  // /app without ever passing through the auth-page force-consent overlay.
  // Once the account store reports ready (so we don't flash this during
  // boot for users whose customize/account is still loading), check whether
  // the user actually acknowledged the banner — if not, dim the page until
  // they do. This is belt-and-braces; the auth pages already gate the
  // common path, but bookmarked SSO start URLs / direct visits can skip it.
  useEffect(() => {
    if (!customizeReady || !cookieBannerEnabled) return;
    let cancelled = false;
    let cleanup: (() => void) | undefined;
    (async () => {
      const ready = await redux.getStore("account").waitUntilReady();
      if (cancelled || !ready) return;
      if (!redux.getStore("account").get("is_logged_in")) return;
      if (hasEssentialConsent()) return;
      cleanup = enableForceConsent();
    })();
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [customizeReady, cookieBannerEnabled]);

  // Persist consent (categories + last-changed timestamp) to the account
  // record so users can review/audit their choice from settings, and so we
  // have a server-side record of consent. The browser cookie is still the
  // authoritative source for the running session — we only push *to* the
  // account, never restore from it (consent is browser-bound under GDPR).
  const isLoggedIn = useTypedRedux("account", "is_logged_in");
  useEffect(() => {
    if (!cookieBannerEnabled || !isLoggedIn) return;
    return onConsentChange((snap: ConsentSnapshot | null) => {
      // Skip null: vanilla-cookieconsent flickers through validConsent ===
      // false mid-write during category toggles, and the cc_cookie can
      // expire after a year. Neither should wipe the account record — the
      // last-known state is the audit trail.
      if (snap == null) return;
      const stored: any = redux
        .getStore("account")
        .getIn(["other_settings", "cookie_consent"]);
      if (
        stored != null &&
        typeof stored?.get === "function" &&
        stored.get("timestamp") === snap.timestamp &&
        stored.get("revision") === snap.revision
      ) {
        return; // already in sync
      }
      redux.getActions("account").set_other_settings("cookie_consent", snap);
    });
  }, [cookieBannerEnabled, isLoggedIn]);

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

  return (
    <AppContext.Provider value={{ ...appState, ...timeAgo }}>
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
