export const LOCALES = ["en", "de", "fr", "es", "zh"] as const;

export type Locale = (typeof LOCALES)[number];

export function isLocale(val: unknown): val is Locale {
  if (typeof val !== "string") return false;
  return LOCALES.includes(val as any);
}
