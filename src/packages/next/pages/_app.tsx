/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// The official antd docs suggest doing this first.  It normalizes
// the css in a way that is compatible with antd.
// I think this is the correct fix for https://github.com/sagemathinc/cocalc/issues/6285
// now that we are using antd v5.
import "antd/dist/reset.css";
import "@ant-design/v5-patch-for-react-19";

import { ConfigProvider } from "antd";
import { useRouter } from "next/router";
import { useEffect } from "react";
import { Locale } from "locales/misc";

// Initialize the appBasePath for the frontend codebase.
import "@cocalc/frontend/customize/app-base-path";
import "vanilla-cookieconsent/dist/cookieconsent.css";
import { enableForceConsent } from "@cocalc/frontend/cookie-consent";
import { initCookieConsent } from "@cocalc/frontend/cookie-consent/init";

// CoCalc 3rd party libraries
import "@cocalc/cdn/dist/codemirror/lib/codemirror.css";
import "@cocalc/cdn/dist/katex/katex.min.css";
import "@cocalc/frontend/editors/slate/elements/elements.css";
import { AppContext, DEFAULT_CONTEXT } from "@cocalc/frontend/app/use-context";
import { getBaseAntdTheme } from "@cocalc/frontend/app/antd-base-theme";

// The IntlProvider makes translated components from the frontend work.
// It's english only, using the fallback defaultMessage.
import { IntlProvider } from "react-intl";

import { LOCALIZE_DEFAULT_ELEMENTS } from "@cocalc/frontend/app/localize-default-elements";
import { DEFAULT_LOCALE } from "@cocalc/util/i18n";

import type { AppProps } from "next/app";

function MyApp({
  Component,
  pageProps,
}: // router,
AppProps & { locale: Locale }) {
  const antdTheme = getBaseAntdTheme();
  const router = useRouter();
  const customize = pageProps?.customize;
  // customize is undefined on pages that don't go through withCustomize
  // (notably 404 / _error). Don't make a "banner disabled" decision in
  // that case — that would let Analytics render legacy SSR scripts and
  // bypass the consent contract.
  const customizeAvailable = customize != null;
  const cookieBannerEnabled = customize?.cookieBannerEnabled;
  const cookieBannerText = customize?.cookieBannerText;
  useEffect(() => {
    if (!customizeAvailable) return;
    initCookieConsent({
      enabled: !!cookieBannerEnabled,
      textMarkdown: cookieBannerText,
    });
  }, [customizeAvailable, cookieBannerEnabled, cookieBannerText]);

  // Force-consent mode on sign-up / anonymous-try / SSO launch pages: a
  // dark overlay blocks interaction with the form until the user accepts
  // the banner. We toggle this on every route change rather than baking
  // it into the banner config at init — `disablePageInteraction` is a
  // one-shot config option, so a user who lands on `/` first and then
  // navigates to `/auth/sign-up` wouldn't see the dim otherwise.
  // enableForceConsent is also a no-op when the user has already
  // consented. Sign-up gates the new-account flow before the first
  // remember_me cookie is set; /auth/try gates anonymous account
  // creation (the redirect lands back on a Next page, so the SPA's
  // fallback never fires); /sso/* gates the redirect that hands control
  // to the external IdP, since the callback drops session cookies.
  // Sign-in is intentionally *not* gated here — once that flow reaches
  // the SPA, the SPA's own force-consent fallback (app/render.tsx)
  // takes over, and the in-place sign-in/up panel adds its own gate.
  const path = router.pathname ?? "";
  const isMandatoryRoute =
    /^\/auth\/(sign-up|try)/.test(path) || /^\/sso(\/|$)/.test(path);
  useEffect(() => {
    if (!cookieBannerEnabled || !isMandatoryRoute) return;
    return enableForceConsent();
  }, [cookieBannerEnabled, isMandatoryRoute]);
  return (
    <AppContext.Provider value={{ ...DEFAULT_CONTEXT }}>
      <ConfigProvider theme={antdTheme}>
        <IntlProvider
          locale={DEFAULT_LOCALE}
          messages={{}}
          defaultLocale={DEFAULT_LOCALE}
          defaultRichTextElements={LOCALIZE_DEFAULT_ELEMENTS}
        >
          <Component {...pageProps} />
        </IntlProvider>
      </ConfigProvider>
    </AppContext.Provider>
  );
}

export default MyApp;

// Duplicated in packages/frontend/codemirror/css.js
import "@cocalc/cdn/dist/codemirror/theme/3024-day.css";
import "@cocalc/cdn/dist/codemirror/theme/3024-night.css";
import "@cocalc/cdn/dist/codemirror/theme/abbott.css";
import "@cocalc/cdn/dist/codemirror/theme/abcdef.css";
import "@cocalc/cdn/dist/codemirror/theme/ambiance.css";
import "@cocalc/cdn/dist/codemirror/theme/ayu-dark.css";
import "@cocalc/cdn/dist/codemirror/theme/ayu-mirage.css";
import "@cocalc/cdn/dist/codemirror/theme/base16-dark.css";
import "@cocalc/cdn/dist/codemirror/theme/base16-light.css";
import "@cocalc/cdn/dist/codemirror/theme/bespin.css";
import "@cocalc/cdn/dist/codemirror/theme/blackboard.css";
import "@cocalc/cdn/dist/codemirror/theme/cobalt.css";
import "@cocalc/cdn/dist/codemirror/theme/colorforth.css";
import "@cocalc/cdn/dist/codemirror/theme/darcula.css";
import "@cocalc/cdn/dist/codemirror/theme/dracula.css";
import "@cocalc/cdn/dist/codemirror/theme/duotone-dark.css";
import "@cocalc/cdn/dist/codemirror/theme/duotone-light.css";
import "@cocalc/cdn/dist/codemirror/theme/eclipse.css";
import "@cocalc/cdn/dist/codemirror/theme/elegant.css";
import "@cocalc/cdn/dist/codemirror/theme/erlang-dark.css";
import "@cocalc/cdn/dist/codemirror/theme/gruvbox-dark.css";
import "@cocalc/cdn/dist/codemirror/theme/hopscotch.css";
import "@cocalc/cdn/dist/codemirror/theme/icecoder.css";
import "@cocalc/cdn/dist/codemirror/theme/idea.css";
import "@cocalc/cdn/dist/codemirror/theme/isotope.css";
import "@cocalc/cdn/dist/codemirror/theme/juejin.css";
import "@cocalc/cdn/dist/codemirror/theme/lesser-dark.css";
import "@cocalc/cdn/dist/codemirror/theme/liquibyte.css";
import "@cocalc/cdn/dist/codemirror/theme/lucario.css";
import "@cocalc/cdn/dist/codemirror/theme/material-darker.css";
import "@cocalc/cdn/dist/codemirror/theme/material-ocean.css";
import "@cocalc/cdn/dist/codemirror/theme/material-palenight.css";
import "@cocalc/cdn/dist/codemirror/theme/material.css";
import "@cocalc/cdn/dist/codemirror/theme/mbo.css";
import "@cocalc/cdn/dist/codemirror/theme/mdn-like.css";
import "@cocalc/cdn/dist/codemirror/theme/midnight.css";
import "@cocalc/cdn/dist/codemirror/theme/monokai.css";
import "@cocalc/cdn/dist/codemirror/theme/neat.css";
import "@cocalc/cdn/dist/codemirror/theme/neo.css";
import "@cocalc/cdn/dist/codemirror/theme/night.css";
import "@cocalc/cdn/dist/codemirror/theme/oceanic-next.css";
import "@cocalc/cdn/dist/codemirror/theme/panda-syntax.css";
import "@cocalc/cdn/dist/codemirror/theme/paraiso-dark.css";
import "@cocalc/cdn/dist/codemirror/theme/paraiso-light.css";
import "@cocalc/cdn/dist/codemirror/theme/pastel-on-dark.css";
import "@cocalc/cdn/dist/codemirror/theme/railscasts.css";
import "@cocalc/cdn/dist/codemirror/theme/rubyblue.css";
import "@cocalc/cdn/dist/codemirror/theme/seti.css";
import "@cocalc/cdn/dist/codemirror/theme/shadowfox.css";
import "@cocalc/cdn/dist/codemirror/theme/solarized.css";
import "@cocalc/cdn/dist/codemirror/theme/ssms.css";
import "@cocalc/cdn/dist/codemirror/theme/the-matrix.css";
import "@cocalc/cdn/dist/codemirror/theme/tomorrow-night-bright.css";
import "@cocalc/cdn/dist/codemirror/theme/tomorrow-night-eighties.css";
import "@cocalc/cdn/dist/codemirror/theme/ttcn.css";
import "@cocalc/cdn/dist/codemirror/theme/twilight.css";
import "@cocalc/cdn/dist/codemirror/theme/vibrant-ink.css";
import "@cocalc/cdn/dist/codemirror/theme/xq-dark.css";
import "@cocalc/cdn/dist/codemirror/theme/xq-light.css";
import "@cocalc/cdn/dist/codemirror/theme/yeti.css";
import "@cocalc/cdn/dist/codemirror/theme/yonce.css";
import "@cocalc/cdn/dist/codemirror/theme/zenburn.css";

import "@cocalc/cdn/dist/cm-custom-theme/cocalc-dark.css";
import "@cocalc/cdn/dist/cm-custom-theme/cocalc-light.css";

import "@uiw/react-textarea-code-editor/dist.css";

import "../styles/bootstrap-visible.css";
import "../styles/globals.css";
