import { unreachable } from "@cocalc/util/misc";
import { Locale } from "./consts";
import { I18nDictionary } from "next-translate";

async function getFooterMessages(locale: Locale): Promise<I18nDictionary> {
  switch (locale) {
    case "en":
      return (await import("locales/en/footer.json")).default;
    case "de":
      return (await import("locales/de/footer.json")).default;
    case "fr":
      return (await import("locales/fr/footer.json")).default;
    case "es":
      return (await import("locales/es/footer.json")).default;
    case "zh":
      return (await import("locales/zh/footer.json")).default;
    default:
      unreachable(locale);
  }
  return {};
}

async function getIndexMessages(locale: Locale): Promise<I18nDictionary> {
  switch (locale) {
    case "en":
      return (await import("locales/en/index.json")).default;
    case "de":
      return (await import("locales/de/index.json")).default;
    case "fr":
      return (await import("locales/fr/index.json")).default;
    case "es":
      return (await import("locales/es/index.json")).default;
    case "zh":
      return (await import("locales/zh/index.json")).default;
    default:
      unreachable(locale);
  }
  return {};
}

export async function getI18nMessages(locale: Locale) {
  return {
    index: await getIndexMessages(locale),
    footer: await getFooterMessages(locale),
  };
}
