import type { Locale } from "@cocalc/util/i18n/const";
export type { Locale };

import { isLocale, LOCALE } from "@cocalc/util/i18n/const";
export { isLocale, LOCALE };

export function query2locale(query: { locale?: string | string[] }): Locale {
  const localeQuery = query.locale;
  return isLocale(localeQuery) ? localeQuery : "en";
}
