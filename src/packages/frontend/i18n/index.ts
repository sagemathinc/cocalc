export { labels } from "./common";

export const LOCALIZATIONS = {
  en: "English",
  de: "German",
  zh: "Chinese",
} as const;

export type Locale = keyof typeof LOCALIZATIONS;

export function sanitizeLocale(l: unknown): Locale {
  if (typeof l !== "string") return "en";
  return l in LOCALIZATIONS ? (l as Locale) : "en";
}
