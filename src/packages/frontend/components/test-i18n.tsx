/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// a component to test translation functionality in the frontend and next code

import { FormattedMessage, useIntl } from "react-intl";

import { labels } from "@cocalc/frontend/i18n";

export function TestI18N() {
  const intl = useIntl();

  const msg = intl.formatMessage(labels.cancel);
  const num = 13;

  return (
    <span style={{ background: "yellow" }}>
      {num} <FormattedMessage {...labels.message_plural} values={{ num }} />{" "}
      {msg}
    </span>
  );
}
