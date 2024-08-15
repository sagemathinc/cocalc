// ATTN: these languages have to match the frontend/package.json script "i18n:download",
//       be valid for Antd (<AntdConfigProvider localize.../>),
//       and also harmonize with localize::loadLocaleData

const LOCALE = ["en", "es", "de", "zh"] as const;

export type Locale = (typeof LOCALE)[number];

export const LOCALIZATIONS: {
  [key in Locale]: { name: string; flag: string };
} = {
  en: { name: "English", flag: "🇺🇸" },
  es: { name: "Spanish", flag: "🇪🇸" },
  de: { name: "German", flag: "🇩🇪" },
  zh: { name: "Chinese", flag: "🇨🇳" },
} as const;

export const DEFAULT_LOCALE: Locale = "en";
