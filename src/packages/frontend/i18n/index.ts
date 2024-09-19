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

export { editor, labels, menu, jupyter, dialogs } from "./common";

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
        return import("@cocalc/frontend/i18n/trans/de_DE.compiled.json");
      case "zh":
        return import("@cocalc/frontend/i18n/trans/zh_CN.compiled.json");
      case "es":
        return import("@cocalc/frontend/i18n/trans/es_ES.compiled.json");
      case "fr":
        return import("@cocalc/frontend/i18n/trans/fr_FR.compiled.json");
      case "it":
        return import("@cocalc/frontend/i18n/trans/it_IT.compiled.json");
      case "ru":
        return import("@cocalc/frontend/i18n/trans/ru_RU.compiled.json");
      case "ja":
        return import("@cocalc/frontend/i18n/trans/ja_JP.compiled.json");
      case "pt":
        return import("@cocalc/frontend/i18n/trans/pt_PT.compiled.json");
      case "ko":
        return import("@cocalc/frontend/i18n/trans/ko_KR.compiled.json");
      case "pl":
        return import("@cocalc/frontend/i18n/trans/pl_PL.compiled.json");
      case "tr":
        return import("@cocalc/frontend/i18n/trans/tr_TR.compiled.json");
      case "he":
        return import("@cocalc/frontend/i18n/trans/he_IL.compiled.json");
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

// The ordering is a bit "opinionated". The top languages are European ones, and German has the best quality translations.
// Then come other European languges, kind of alphabetical.
// Then, the Asian group starts with Chinese, as the largest group.
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
  de: {
    name: "German",
    flag: "🇩🇪",
    native: "Deutsch",
    trans: defineMessage({
      id: "i18n.localization.lang.german",
      defaultMessage: "German",
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
  fr: {
    name: "French",
    flag: "🇫🇷",
    native: "Français",
    trans: defineMessage({
      id: "i18n.localization.lang.french",
      defaultMessage: "French",
    }),
  },
  it: {
    name: "Italian",
    flag: "🇮🇹",
    native: "Italiano",
    trans: defineMessage({
      id: "i18n.localization.lang.italian",
      defaultMessage: "Italian",
    }),
  },
  pl: {
    name: "Polish",
    flag: "🇵🇱",
    native: "Polski",
    trans: defineMessage({
      id: "i18n.localization.lang.polish",
      defaultMessage: "Polish",
    }),
  },
  pt: {
    name: "Portuguese",
    flag: "🇵🇹",
    native: "Português",
    trans: defineMessage({
      id: "i18n.localization.lang.portuguese",
      defaultMessage: "Portuguese",
    }),
  },
  tr: {
    name: "Turkish",
    flag: "🇹🇷",
    native: "Türkçe",
    trans: defineMessage({
      id: "i18n.localization.lang.turkish",
      defaultMessage: "Turkish",
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
  ja: {
    name: "Japanese",
    flag: "🇯🇵",
    native: "日本語",
    trans: defineMessage({
      id: "i18n.localization.lang.japanese",
      defaultMessage: "Japanese",
    }),
  },
  ko: {
    name: "Korean",
    flag: "🇰🇷",
    native: "한국어",
    trans: defineMessage({
      id: "i18n.localization.lang.korean",
      defaultMessage: "Korean",
    }),
  },
  he: {
    name: "Hebrew",
    flag: "🇮🇱",
    native: "עִבְרִית",
    trans: defineMessage({
      id: "i18n.localization.lang.hebrew",
      defaultMessage: "Hebrew",
    }),
  },
  ru: {
    name: "Russian",
    flag: "🇷🇺",
    native: "Русский",
    trans: defineMessage({
      id: "i18n.localization.lang.russian",
      defaultMessage: "Russian",
    }),
  },
} as const;
