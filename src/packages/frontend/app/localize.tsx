/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import type { Locale as AntdLocale } from "antd/lib/locale";
import deDE from "antd/locale/de_DE";
import enUS from "antd/locale/en_US";
import esES from "antd/locale/es_ES";
import zhCN from "antd/locale/zh_CN";
import { createContext, useContext, useEffect, useState } from "react";
import { IntlProvider } from "react-intl";

import { Loading } from "@cocalc/frontend/components";
import {
  DEFAULT_LOCALE,
  loadLocaleData,
  Locale,
  LOCALIZATIONS,
  Messages,
  sanitizeLocale,
} from "@cocalc/frontend/i18n";
import { unreachable } from "@cocalc/util/misc";

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

export function Localize({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = useState<Messages | undefined>(undefined);
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    loadLocaleData(locale).then((messages) => setMessages(messages));
  }, [locale]);

  const { name } = LOCALIZATIONS[locale];

  return (
    <LocalizationContext.Provider
      value={{
        setLocale: (locale: unknown) => setLocale(sanitizeLocale(locale)),
        locale,
      }}
    >
      <IntlProvider
        locale={locale}
        messages={messages}
        defaultLocale={DEFAULT_LOCALE}
      >
        {messages ? (
          children
        ) : (
          <Loading text={`Loading ${name} language support…`} theme="medium" />
        )}
      </IntlProvider>
    </LocalizationContext.Provider>
  );
}

export function useLocalizationCtx() {
  return useContext(LocalizationContext);
}

export function useAntdLocale(): AntdLocale {
  const { locale } = useLocalizationCtx();
  switch (locale) {
    case "en":
      return enUS;
    case "de":
      return deDE;
    case "zh":
      return zhCN;
    case "es":
      return esES;
    default:
      unreachable(locale);
      throw new Error(`Unknown locale '${locale}.`);
  }
}
