/*
 *  This file is part of CoCalc: Copyright © 2024 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { createIntl, createIntlCache, IntlShape } from "react-intl";

import { redux } from "@cocalc/frontend/app-framework";
import { OTHER_SETTINGS_LOCALE_KEY } from "@cocalc/util/i18n";
import { loadLocaleMessages } from ".";
import { Messages } from "./types";
import { sanitizeLocale } from "./utils";

// This is optional but highly recommended, since it prevents memory leak
const cache = createIntlCache();

// Use this for example in an action, outside of React. e.g.
// const intl = await getIntl();
// intl.formatMessage(labels.account);
export async function getIntl(): Promise<IntlShape> {
  const val = redux
    .getStore("account")
    .getIn(["other_settings", OTHER_SETTINGS_LOCALE_KEY]);
  const locale = sanitizeLocale(val);
  const messages: Messages = await loadLocaleMessages(locale);
  return createIntl({ locale, messages }, cache);
}
