/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { useIntl } from "react-intl";

import { Icon } from "@cocalc/frontend/components";
import { labels } from "@cocalc/frontend/i18n";

export function Connecting(_props) {
  const intl = useIntl();

  return (
    <div
      style={{
        fontSize: "25px",
        marginTop: "75px",
        textAlign: "center",
        color: "var(--cocalc-text-secondary, #808080)",
      }}
    >
      <Icon name="cocalc-ring" spin /> {intl.formatMessage(labels.connecting)}
      ...
    </div>
  );
}
