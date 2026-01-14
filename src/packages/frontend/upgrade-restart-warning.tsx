/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Alert } from "antd";
import { useIntl } from "react-intl";
import { labels } from "@cocalc/frontend/i18n";
import { React } from "./app-framework";

export function UpgradeRestartWarning(props: { style?: React.CSSProperties }) {
  const intl = useIntl();
  const projectLabelLower = intl.formatMessage(labels.project).toLowerCase();
  const mesg = (
    <span>
      WARNING: When upgrades for a {projectLabelLower} change, that{" "}
      {projectLabelLower} <b>must be restarted</b>, which terminates running
      computations.
    </span>
  );
  return <Alert type="info" message={mesg} style={props.style} />;
}
