/*
 *  This file is part of CoCalc: Copyright © 2024 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import {
    DEFAULT_LOCALE,
    KEEP_EN_LOCALE,
    Locale,
} from "@cocalc/util/consts/locale";
import { LOCALIZATIONS } from "@cocalc/util/i18n";

export function sanitizeLocale(l: unknown): Locale {
  if (typeof l !== "string") return DEFAULT_LOCALE;
  if (l === KEEP_EN_LOCALE) return "en";
  return l in LOCALIZATIONS ? (l as Locale) : DEFAULT_LOCALE;
}
