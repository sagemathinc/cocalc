/*
 *  This file is part of CoCalc: Copyright © 2024 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import {
  createIntl,
  createIntlCache,
  IntlShape,
  MessageFormatElement,
} from "react-intl";

import { AccountState } from "@cocalc/frontend/account/types";
import { redux } from "@cocalc/frontend/app-framework";
import {
  DEFAULT_LOCALE,
  KEEP_EN_LOCALE,
  Locale,
} from "@cocalc/util/consts/locale";
import {
  isIntlMessage,
  LOCALIZATIONS,
  OTHER_SETTINGS_LOCALE_KEY,
} from "@cocalc/util/i18n";
import type { IntlMessage } from "@cocalc/util/i18n/types";
import { unreachable } from "@cocalc/util/misc";

export { dialogs, editor, jupyter, labels, menu, course } from "./common";

export {
  DEFAULT_LOCALE,
  isIntlMessage,
  OTHER_SETTINGS_LOCALE_KEY,
  LOCALIZATIONS,
};

export type { IntlMessage, Locale };

export type Messages =
  | Record<string, string>
  | Record<string, MessageFormatElement[]>;

export function sanitizeLocale(l: unknown): Locale {
  if (typeof l !== "string") return DEFAULT_LOCALE;
  if (l === KEEP_EN_LOCALE) return "en";
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
      case "hi":
        return import("@cocalc/frontend/i18n/trans/hi_IN.compiled.json");
      case "hu":
        return import("@cocalc/frontend/i18n/trans/hu_HU.compiled.json");
      case "ar":
        return import("@cocalc/frontend/i18n/trans/ar_EG.compiled.json");
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
