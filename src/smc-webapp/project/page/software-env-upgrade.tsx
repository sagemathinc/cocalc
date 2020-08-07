/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Alert, Button } from "../../antd-bootstrap";
import {
  React,
  redux,
  // useTypedRedux,
} from "../../app-framework";
import { A, Icon } from "../../r_misc";
import { ALERT_STYLE } from "../warnings/common";

import {
  FALLBACK_COMPUTE_IMAGE,
  COMPUTE_IMAGES,
} from "smc-util/compute-images";

const UPGRADE_STYLE: React.CSSProperties = {
  ...ALERT_STYLE,
  ...{ fontSize: "11pt", padding: "15px" },
};

export const SoftwareEnvUpgrade: React.FC<{ project_id: string }> = ({
  project_id,
}) => {
  const projects_store = redux.getStore("projects");
  const compute_image =
    projects_store.getIn(["project_map", project_id, "compute_image"]) ??
    FALLBACK_COMPUTE_IMAGE;

  return (
    <Alert bsStyle={"info"} style={UPGRADE_STYLE}>
      <div style={{ display: "flex" }}>
        <div style={{ flex: "1" }}>
          <Icon name="exclamation-triangle" /> Software Update Available!{" "}
          {compute_image}
        </div>
        <div style={{ flex: "0" }}>
          <Button onClick={() => alert("nope :-(")} style={{ float: "right" }}>
            Dismiss
          </Button>
          <Button
            onClick={() => alert("yay upgrade!")}
            style={{ float: "right" }}
          >
            Upgrade
          </Button>
        </div>
      </div>
    </Alert>
  );
};
