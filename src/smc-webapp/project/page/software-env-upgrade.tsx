/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React, redux, useTypedRedux } from "../../app-framework";
import { A, Icon, COLORS } from "../../r_misc";
import { ALERT_STYLE } from "../warnings/common";
import { KUCALC_COCALC_COM } from "smc-util/db-schema/site-defaults";
import { Alert, Button } from "../../antd-bootstrap";
import {
  FALLBACK_COMPUTE_IMAGE,
  DEFAULT_COMPUTE_IMAGE,
  COMPUTE_IMAGES,
} from "smc-util/compute-images";

const UPGRADE_STYLE: React.CSSProperties = {
  ...ALERT_STYLE,
  ...{ fontSize: "11pt", padding: "15px" },
};

export const SoftwareEnvUpgrade: React.FC<{ project_id: string }> = ({
  project_id,
}) => {
  // if we're outside cocalc.com, this is not applicable
  const customize_kucalc = useTypedRedux("customize", "kucalc");
  if (customize_kucalc !== KUCALC_COCALC_COM) return null;

  const projects_store = redux.getStore("projects");
  const compute_image =
    projects_store.getIn(["project_map", project_id, "compute_image"]) ??
    FALLBACK_COMPUTE_IMAGE;

  // we only upgrade from the old fallback "default" to the new default. do not bother about any other names!
  if (compute_image !== FALLBACK_COMPUTE_IMAGE) return null;

  const oldname = COMPUTE_IMAGES[FALLBACK_COMPUTE_IMAGE].title;
  const newname = COMPUTE_IMAGES[DEFAULT_COMPUTE_IMAGE].title;

  return (
    <Alert bsStyle={"info"} style={UPGRADE_STYLE}>
      <div style={{ display: "flex" }}>
        <div style={{ flex: "1" }}>
          <Icon name="exclamation-triangle" /> Software Update Available! Update
          this project running on {oldname} to {newname}.{" "}
          <A href={"https://doc.cocalc.com/"}>Lean more …</A>.
          <br />
          <span style={{ color: COLORS.GRAY }}>
            (You can also upgrade or downgrade later in Project Settings →
            Project Control)
          </span>
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
