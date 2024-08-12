export const LANGS = {
  en_US: "English",
  de_DE: "German",
  zh_CN: "Chinese",
} as const;

export type Languages = keyof typeof LANGS;
