import type { I18nDictionary } from "next-translate";

import { unreachable } from "@cocalc/util/misc";
import type { Locale } from "./misc";

async function getIndexMessages(locale: Locale): Promise<I18nDictionary> {
  switch (locale) {
    case "en":
      return (await import("locales/en/index.json")).default;
    case "de":
      return (await import("locales/de/index.json")).default;
    case "es":
      return (await import("locales/es/index.json")).default;
    case "eu":
      return (await import("locales/eu/index.json")).default;
    case "zh":
      return (await import("locales/zh/index.json")).default;
    case "ru":
      return (await import("locales/ru/index.json")).default;
    case "fr":
      return (await import("locales/fr/index.json")).default;
    case "it":
      return (await import("locales/it/index.json")).default;
    case "nl":
      return (await import("locales/nl/index.json")).default;
    case "ja":
      return (await import("locales/ja/index.json")).default;
    case "hi":
      return (await import("locales/hi/index.json")).default;
    case "br":
      return (await import("locales/br/index.json")).default;
    case "pt":
      return (await import("locales/pt/index.json")).default;
    case "ko":
      return (await import("locales/ko/index.json")).default;
    case "pl":
      return (await import("locales/pl/index.json")).default;
    case "tr":
      return (await import("locales/tr/index.json")).default;
    case "he":
      return (await import("locales/he/index.json")).default;
    case "hu":
      return (await import("locales/hu/index.json")).default;
    case "ar":
      return (await import("locales/ar/index.json")).default;
    default:
      unreachable(locale);
  }
  return {};
}

export async function getI18nMessages(locale: Locale) {
  return {
    index: await getIndexMessages(locale),
  };
}
