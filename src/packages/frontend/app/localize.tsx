/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import type { Locale as AntdLocale } from "antd/lib/locale";
import deDE from "antd/locale/de_DE";
import enUS from "antd/locale/en_US";
import zhCN from "antd/locale/zh_CN";
import { createContext, useContext, useEffect, useState } from "react";
import { IntlProvider, MessageFormatElement } from "react-intl";

import { Locale, sanitizeLocale } from "@cocalc/frontend/i18n/index";

const DEFAULT_LOCALE: Locale = "en";

type Messages = Record<string, string> | Record<string, MessageFormatElement[]>;

export function loadLocaleData(locale: Locale): Promise<Messages> {
  switch (locale) {
    case "de":
      return import(
        "@cocalc/frontend/i18n/de_DE.json"
      ) as any as Promise<Messages>;
    case "zh":
      return import(
        "@cocalc/frontend/i18n/zh_CN.json"
      ) as any as Promise<Messages>;
    case "en":
      return import(
        "@cocalc/frontend/i18n/en_US.json"
      ) as any as Promise<Messages>;
    default:
      throw new Error(`Unknown locale '${locale}.`);
  }
}

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
