/*
 *  This file is part of CoCalc: Copyright © 2024 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import {
  createIntl,
  createIntlCache,
  defineMessage,
  IntlShape,
  MessageFormatElement,
} from "react-intl";

import { AccountState } from "@cocalc/frontend/account/types";
import { redux } from "@cocalc/frontend/app-framework";
import { DEFAULT_LOCALE, Locale } from "@cocalc/util/consts/locale";
import { unreachable } from "@cocalc/util/misc";
import { IntlMessage, isIntlMessage } from "./types";

export { editor, labels, menu } from "./common";

export { DEFAULT_LOCALE, isIntlMessage };

export type { IntlMessage, Locale };

export const OTHER_SETTINGS_LOCALE_KEY = "i18n";

export type Messages =
  | Record<string, string>
  | Record<string, MessageFormatElement[]>;

export function sanitizeLocale(l: unknown): Locale {
  if (typeof l !== "string") return DEFAULT_LOCALE;
  return l in LOCALIZATIONS ? (l as Locale) : DEFAULT_LOCALE;
}

export function getLocale(
  other_settings: AccountState["other_settings"],
): Locale {
  const val = other_settings.get(OTHER_SETTINGS_LOCALE_KEY);
  return sanitizeLocale(val);
}

export function loadLocaleMessages(locale: Locale): Promise<Messages> {
  return (() => {
    switch (locale) {
      case "en":
        // For english, we do not specify any messages and let the fallback mechanism kick in
        // Hence "defaultMessage" messages are used directly.
        return {};
      case "de":
        return import("@cocalc/frontend/i18n/de_DE.compiled.json");
      case "zh":
        return import("@cocalc/frontend/i18n/zh_CN.compiled.json");
      case "es":
        return import("@cocalc/frontend/i18n/es_ES.compiled.json");
      default:
        unreachable(locale);
        throw new Error(`Unknown locale '${locale}.`);
    }
  })() as any as Promise<Messages>;
}

// This is optional but highly recommended, since it prevents memory leak
const cache = createIntlCache();

// Use this for example in an action, outside of React. e.g.
// const intl = await getIntl();
// intl.formatMessage(labels.account);
export async function getIntl(): Promise<IntlShape> {
  const val = redux
    .getStore("account")
    .getIn(["other_settings", OTHER_SETTINGS_LOCALE_KEY]);
  const locale = sanitizeLocale(val);
  const messages: Messages = await loadLocaleMessages(locale);
  return createIntl({ locale, messages }, cache);
}

export const LOCALIZATIONS: {
  [key in Locale]: {
    name: string;
    flag: string;
    native: string;
    trans: IntlMessage;
  };
} = {
  en: {
    name: "English",
    flag: "🇺🇸",
    native: "English",
    trans: defineMessage({
      id: "i18n.localization.lang.english",
      defaultMessage: "English",
    }),
  },
  es: {
    name: "Spanish",
    flag: "🇪🇸",
    native: "Español",
    trans: defineMessage({
      id: "i18n.localization.lang.spanish",
      defaultMessage: "Spanish",
    }),
  },
  de: {
    name: "German",
    flag: "🇩🇪",
    native: "Deutsch",
    trans: defineMessage({
      id: "i18n.localization.lang.german",
      defaultMessage: "German",
    }),
  },
  zh: {
    name: "Chinese",
    flag: "🇨🇳",
    native: "中文",
    trans: defineMessage({
      id: "i18n.localization.lang.chinese",
      defaultMessage: "Chinese",
    }),
  },
} as const;
