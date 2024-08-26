/*
 *  This file is part of CoCalc: Copyright © 2024 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// ATTN: these languages have to match the frontend/package.json script "i18n:download",
//       be valid for Antd (<AntdConfigProvider localize.../>),
//       and also harmonize with localize::loadLocaleData
export const LOCALE = ["en", "es", "de", "zh"] as const;

export type Locale = (typeof LOCALE)[number];

export const DEFAULT_LOCALE: Locale = "en";
