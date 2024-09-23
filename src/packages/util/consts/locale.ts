/*
 *  This file is part of CoCalc: Copyright © 2024 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// ATTN: these languages have to match the frontend/package.json script "i18n:download",
//       be valid for Antd (<AntdConfigProvider localize.../>),
//       and also harmonize with localize::loadLocaleData
export const LOCALE = [
  "en", // that's the default, i.e. user never explicitly selected a language
  "es",
  "de",
  "zh",
  "ru",
  "fr",
  "it",
  "ja",
  "pt",
  "ko",
  "pl",
  "tr",
  "he",
] as const;

export type Locale = (typeof LOCALE)[number];

export const DEFAULT_LOCALE: Locale = "en";

// user's browser is not english, but user wants to keep english
// this is only for the account's other_settings and maps to "en"
export const KEEP_EN_LOCALE = "en-keep";
