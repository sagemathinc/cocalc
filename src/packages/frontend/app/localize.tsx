/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import type { Locale as AntdLocale } from "antd/lib/locale";
import deDE from "antd/locale/de_DE";
import enUS from "antd/locale/en_US";
import zhCN from "antd/locale/zh_CN";
import { createContext, useContext, useEffect, useState } from "react";
import { IntlProvider } from "react-intl";

import {
  DEFAULT_LOCALE,
  loadLocaleData,
  Locale,
  Messages,
  sanitizeLocale,
} from "@cocalc/frontend/i18n";

interface LanguageContextInterface {
  setLocalization: (language: string) => void;
  locale: Locale;
}

export const LocalizationContext = createContext<LanguageContextInterface>({
  locale: DEFAULT_LOCALE,
  setLocalization: () => {
    console.warn("LanguageContext.changeLanguage not implemented");
  },
});

export function Localize({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = useState<Messages | undefined>({});
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    loadLocaleData(locale).then((messages) => setMessages(messages));
  }, [locale]);

  return (
    <LocalizationContext.Provider
      value={{
        setLocalization: (locale: unknown) => setLocale(sanitizeLocale(locale)),
        locale,
      }}
    >
      <IntlProvider
        locale={locale}
        messages={messages}
        defaultLocale={DEFAULT_LOCALE}
      >
        {children}
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
    default:
      throw new Error(`Unknown locale '${locale}.`);
  }
}
