import {
  createIntl,
  createIntlCache,
  IntlShape,
  MessageDescriptor,
  MessageFormatElement,
} from "react-intl";

import { AccountState } from "@cocalc/frontend/account/types";
import { redux } from "@cocalc/frontend/app-framework";
import {
  DEFAULT_LOCALE,
  Locale,
  LOCALIZATIONS,
} from "@cocalc/util/consts/locale";
import { unreachable } from "@cocalc/util/misc";

export { labels } from "./common";
export { DEFAULT_LOCALE, LOCALIZATIONS };
export type { Locale };

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
        return import("@cocalc/frontend/i18n/de_DE.json");
      case "zh":
        return import("@cocalc/frontend/i18n/zh_CN.json");
      case "es":
        return import("@cocalc/frontend/i18n/es_ES.json");
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

// In CoCalc, we require all message to have an ID and defaultMessage (which is English)
export type IntlMessage = MessageDescriptor & {
  id: string;
  defaultMessage: string;
};

// For us, the id and defaultMessage must be set to be a MessageDescriptor
export function isIntlMessage(msg: unknown): msg is MessageDescriptor {
  return (
    typeof msg === "object" &&
    msg != null &&
    "id" in msg &&
    "defaultMessage" in msg
  );
}
