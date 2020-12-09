/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React } from "../../app-framework";
import { Alert } from "../../antd-bootstrap";
import { Icon } from "../../r_misc";

// A warning to put on pages when the project is deleted
export const DeletedProjectWarning: React.FC = () => {
  return (
    <Alert bsStyle="danger" style={{ marginTop: "10px" }}>
      <h4>
        <Icon name="exclamation-triangle" /> Warning: this project is{" "}
        <strong>deleted!</strong>
      </h4>
      <p>
        If you intend to use this project, you should{" "}
        <strong>undelete it</strong> in Hide or delete under project settings.
      </p>
    </Alert>
  );
};
