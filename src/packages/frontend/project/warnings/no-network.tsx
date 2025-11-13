/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Alert } from "@cocalc/frontend/antd-bootstrap";
import { Icon } from "@cocalc/frontend/components";
import { UPGRADE_HINT } from "./non-member";

export function NoNetworkProjectWarning() {
  return (
    <Alert bsStyle="warning" style={{ margin: "15px" }}>
      <h4>
        <Icon name="exclamation-triangle" /> Warning: this project{" "}
        <strong>does not have full internet access</strong>.
      </h4>
      <p>{UPGRADE_HINT}</p>
    </Alert>
  );
}
