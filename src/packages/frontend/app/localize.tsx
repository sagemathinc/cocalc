/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { ConfigProvider as AntdConfigProvider } from "antd";
import type { Locale as AntdLocale } from "antd/lib/locale";
import enUS from "antd/locale/en_US";
import { isEmpty } from "lodash";
import { createContext, useContext, useState } from "react";
import { IntlProvider } from "react-intl";
import useAsyncEffect from "use-async-effect";

type OnErrorFn = (typeof IntlProvider.defaultProps)["onError"];

import { Loading } from "@cocalc/frontend/components";
import {
  DEFAULT_LOCALE,
  loadLocaleMessages,
  Locale,
  LOCALIZATIONS,
  Messages,
  sanitizeLocale,
} from "@cocalc/frontend/i18n";
import { unreachable } from "@cocalc/util/misc";
import { useAntdStyleProvider } from "./context";
import { LOCALIZE_DEFAULT_ELEMENTS } from "./localize-default-elements";

interface LanguageContextInterface {
  setLocale: (language: string) => void;
  locale: Locale;
}

export const LocalizationContext = createContext<LanguageContextInterface>({
  locale: DEFAULT_LOCALE,
  setLocale: () => {
    console.warn("LanguageContext.changeLanguage not implemented");
  },
});

// This configures AntD (locale+style) and react-intl
export function Localize({ children }: { children: React.ReactNode }) {
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE);
  const [antdLoc, setAntdLoc] = useState<AntdLocale | undefined>(undefined);
  const [messages, setMessages] = useState<Messages | undefined>(undefined);
  const { antdTheme } = useAntdStyleProvider();

  useAsyncEffect(async () => {
    setMessages(await loadLocaleMessages(locale));
  }, [locale]);

  useAsyncEffect(async () => {
    setAntdLoc(await loadAntdLocale(locale));
  }, [locale]);

  // Update HTML lang attribute for screen readers (WCAG AA)
  useAsyncEffect(async () => {
    document.documentElement.lang = locale;
  }, [locale]);

  function renderApp() {
    // NOTE: the locale will be set from the other_settings, on the "page".
    // So, for the default (english) we always have to render it, and then, maybe, a locale is set...
    if (locale === DEFAULT_LOCALE) {
      // we are explicitly returning as any since ts is suddenly complaining about a potential bigint
      return children as any;
    } else {
      if (isEmpty(messages)) {
        return (
          <Loading
            theme="medium"
            delay={1000}
            text={`Loading support for ${LOCALIZATIONS[locale].name}…`}
          />
        );
      } else {
        return children as any;
      }
    }
  }

  function onError(err: Parameters<OnErrorFn>[0]): ReturnType<OnErrorFn> {
    if (process.env.NODE_ENV !== "production") {
      console.log(err.message);
    }
  }

  return (
    <LocalizationContext.Provider
      value={{
        setLocale: (locale: unknown) => setLocale(sanitizeLocale(locale)),
        locale,
      }}
    >
      <AntdConfigProvider theme={antdTheme} locale={antdLoc}>
        <IntlProvider
          locale={locale}
          messages={messages}
          defaultLocale={DEFAULT_LOCALE}
          onError={onError}
          defaultRichTextElements={LOCALIZE_DEFAULT_ELEMENTS}
        >
          {renderApp()}
        </IntlProvider>
      </AntdConfigProvider>
    </LocalizationContext.Provider>
  );
}

export function useLocalizationCtx() {
  return useContext(LocalizationContext);
}

function loadAntdLocale(locale: Locale): Promise<AntdLocale> {
  return (() => {
    switch (locale) {
      case "en":
        // English is "baked in", because it is the default. Other languages are splitted up...
        return enUS;
      case "de":
        // DEV: all those imports needs to be explicit full strings, and point to the pkg to resolve
        return import("antd/locale/de_DE");
      case "zh":
        return import("antd/locale/zh_CN");
      case "es":
        return import("antd/locale/es_ES");
      case "eu": // there is no basque for antd, but catalan is close enough
        return import("antd/locale/ca_ES");
      case "nl":
        return import("antd/locale/nl_NL");
      case "ru":
        return import("antd/locale/ru_RU");
      case "fr":
        return import("antd/locale/fr_FR");
      case "it":
        return import("antd/locale/it_IT");
      case "ja":
        return import("antd/locale/ja_JP");
      case "pt":
        return import("antd/locale/pt_PT");
      case "br":
        return import("antd/locale/pt_BR");
      case "ko":
        return import("antd/locale/ko_KR");
      case "pl":
        return import("antd/locale/pl_PL");
      case "tr":
        return import("antd/locale/tr_TR");
      case "he":
        return import("antd/locale/he_IL");
      case "hi":
        return import("antd/locale/hi_IN");
      case "hu":
        return import("antd/locale/hu_HU");
      case "ar":
        return import("antd/locale/ar_EG");
      default:
        unreachable(locale);
        throw new Error(`Unknown locale '${locale}.`);
    }
  })() as any as Promise<AntdLocale>;
}
