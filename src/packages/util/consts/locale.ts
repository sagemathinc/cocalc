// ATTN: these languages have to match the frontend/package.json script "i18n:download",
//       be valid for Antd (<AntdConfigProvider localize.../>),
//       and also harmonize with localize::loadLocaleData
export const LOCALIZATIONS = {
  en: "English",
  de: "German",
  zh: "Chinese",
} as const;

export type Locale = keyof typeof LOCALIZATIONS;

export const DEFAULT_LOCALE: Locale = "en";
