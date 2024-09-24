/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { ConfigProvider as AntdConfigProvider } from "antd";
import type { Locale as AntdLocale } from "antd/lib/locale";
import enUS from "antd/locale/en_US";
import { isEmpty } from "lodash";
import { createContext, useContext, useRef, useState } from "react";
import { IntlProvider } from "react-intl";
import useAsyncEffect from "use-async-effect";

type OnErrorFn = (typeof IntlProvider.defaultProps)["onError"];

import { Loading, Paragraph, Text } from "@cocalc/frontend/components";
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
  const uniqueKey = useRef<{ [tag: string]: number }>({});

  // Note: this is e.g. necessary to render text in a modal, where some caching happens, apparently
  function getKey(tag: string): number {
    const n = (uniqueKey.current[tag] ?? 0) + 1;
    uniqueKey.current[tag] = n;
    return n;
  }

  useAsyncEffect(async () => {
    setMessages(await loadLocaleMessages(locale));
  }, [locale]);

  useAsyncEffect(async () => {
    setAntdLoc(await loadAntdLocale(locale));
  }, [locale]);

  function renderApp() {
    // NOTE: the locale will be set from the other_settings, on the "page".
    // So, for the default (english) we always have to render it, and then, maybe, a locale is set...
    if (locale === DEFAULT_LOCALE) {
      return children;
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
        return children;
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
          defaultRichTextElements={{
            b: (ch) => (
              <Text strong key={getKey("b")}>
                {ch}
              </Text>
            ),
            p: (ch) => <Paragraph key={getKey("p")}>{ch}</Paragraph>,
            code: (ch) => (
              <Text code key={getKey("code")}>
                {ch}
              </Text>
            ),
            ul: (e) => <ul key={getKey("ul")}>{e}</ul>,
            ol: (e) => <ol key={getKey("ol")}>{e}</ol>,
            li: (e) => <li key={getKey("li")}>{e}</li>,
          }}
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
