/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// a component to test translation functionality in the frontend and next code

import { FormattedMessage, useIntl } from "react-intl";

import { labels } from "@cocalc/frontend/i18n";

export function TestI18N({ num = 13 }: { num: number }) {
  const intl = useIntl();

  const msg = intl.formatMessage(labels.cancel);

  return (
    <>
      <FormattedMessage
        id="components.test-i18n.msg"
        defaultMessage={"<p>Formatted with <b>bold</b> and <i>italic</i>.</p>"}
      />
      <div>
        The following should say: "{num} messages Cancel": "{num}{" "}
        <FormattedMessage {...labels.message_plural} values={{ num }} /> {msg}"
      </div>
    </>
  );
}
