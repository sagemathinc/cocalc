/*
 *  This file is part of CoCalc: Copyright © 2024 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { AccountState } from "@cocalc/frontend/account/types";
import { DEFAULT_LOCALE, Locale } from "@cocalc/util/consts/locale";
import {
  isIntlMessage,
  LOCALIZATIONS,
  OTHER_SETTINGS_LOCALE_KEY,
} from "@cocalc/util/i18n";
import type { IntlMessage } from "@cocalc/util/i18n/types";
import { unreachable } from "@cocalc/util/misc";
import { Messages } from "./types";
import { sanitizeLocale } from "./utils";

export { course, dialogs, editor, jupyter, labels, menu } from "./common";

export {
  DEFAULT_LOCALE,
  isIntlMessage,
  LOCALIZATIONS,
  OTHER_SETTINGS_LOCALE_KEY,
  sanitizeLocale,
};

export type { IntlMessage, Locale, Messages };

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
      case "eu":
        return import("@cocalc/frontend/i18n/trans/es_PV.compiled.json");
      case "fr":
        return import("@cocalc/frontend/i18n/trans/fr_FR.compiled.json");
      case "it":
        return import("@cocalc/frontend/i18n/trans/it_IT.compiled.json");
      case "nl":
        return import("@cocalc/frontend/i18n/trans/nl_NL.compiled.json");
      case "ru":
        return import("@cocalc/frontend/i18n/trans/ru_RU.compiled.json");
      case "ja":
        return import("@cocalc/frontend/i18n/trans/ja_JP.compiled.json");
      case "pt":
        return import("@cocalc/frontend/i18n/trans/pt_PT.compiled.json");
      case "br":
        return import("@cocalc/frontend/i18n/trans/pt_BR.compiled.json");
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
