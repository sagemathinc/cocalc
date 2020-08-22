/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React, redux, useTypedRedux, useStore } from "../../app-framework";
import {
  A,
  Icon,
  COLORS,
  Loading,
  VisibleMDLG,
  VisibleXSSM,
} from "../../r_misc";
import { ALERT_STYLE } from "../warnings/common";
import { alert_message } from "../../alerts";
import { KUCALC_COCALC_COM } from "smc-util/db-schema/site-defaults";
import { Alert, Button } from "../../antd-bootstrap";
import { Space as AntdSpace } from "antd";
import {
  FALLBACK_COMPUTE_IMAGE,
  DEFAULT_COMPUTE_IMAGE,
  COMPUTE_IMAGES,
} from "smc-util/compute-images";

const UPGRADE_STYLE: React.CSSProperties = {
  ...ALERT_STYLE,
  ...{ fontSize: "11pt", padding: "5px 10px" },
};

const DOC_UBUNTU_2004 = "https://doc.cocalc.com/news/ubuntu-2004.html";

const DISMISS_IMG = "ubuntu1804";

// we only upgrade from not-frozen 18.04 images to the new default.
// do not bother about any other names, including ubuntu1804
const TO_UPGRADE = [FALLBACK_COMPUTE_IMAGE, "previous", "exp"];

function useComputeImage(project_id) {
  const [compute_image, set_compute_image] = React.useState<string | undefined>(
    undefined
  );
  const project_map = useTypedRedux("projects", "project_map");
  const current_image = project_map.getIn([project_id, "compute_image"]);
  if (current_image != compute_image) {
    set_compute_image(current_image);
  }
  return current_image;
}

export const SoftwareEnvUpgrade: React.FC<{ project_id: string }> = ({
  project_id,
}) => {
  // if we're outside cocalc.com, this is not applicable
  const customize_kucalc = useTypedRedux("customize", "kucalc");
  if (customize_kucalc !== KUCALC_COCALC_COM) return null;

  const [updating, set_updating] = React.useState(false);
  const compute_image = useComputeImage(project_id);
  if (compute_image == null) return null;
  if (TO_UPGRADE.indexOf(compute_image) == -1) return null;

  // don't tell students to update. Less surprises and let the teacher controls this…
  const projects_store = useStore("projects");
  const is_student_project = projects_store.is_student_project(project_id);
  if (is_student_project) return null;

  // just a safety measure, before accessing .title
  if (COMPUTE_IMAGES[compute_image] == null) return null;
  const oldname = COMPUTE_IMAGES[compute_image].title;
  const newname = COMPUTE_IMAGES[DEFAULT_COMPUTE_IMAGE].title;

  async function set_image(image: string) {
    set_updating(true);
    const actions = redux.getProjectActions(project_id);
    try {
      await actions.set_compute_image(image);
      if (image != DISMISS_IMG) {
        await redux.getActions("projects").restart_project(project_id);
      }
    } catch (err) {
      alert_message({ type: "error", message: err });
      set_updating(false);
    }
  }

  function render_controls() {
    if (updating) {
      return <Loading text={"Updating ..."} />;
    } else {
      return (
        <AntdSpace>
          <Button onClick={() => set_image(DISMISS_IMG)}>Dismiss</Button>
          <Button
            onClick={() => set_image(DEFAULT_COMPUTE_IMAGE)}
            bsStyle={"primary"}
          >
            Upgrade
          </Button>
        </AntdSpace>
      );
    }
  }

  // we only want to re-render if it is really necessary. the "project_map" changes quite often…
  return React.useMemo(() => {
    return (
      <Alert bsStyle={"info"} style={UPGRADE_STYLE}>
        <div style={{ display: "flex" }}>
          <div style={{ flex: "1 1 auto" }}>
            <Icon name="exclamation-triangle" />{" "}
            <strong>Software Update Available!</strong>{" "}
            <VisibleMDLG>
              Update this project's software environment from "{oldname}" to "
              {newname}". Learn more about{" "}
              <A href={DOC_UBUNTU_2004}>all changes</A>.
            </VisibleMDLG>
            <VisibleXSSM>
              {" "}
              <A href={DOC_UBUNTU_2004}>Learn more ...</A>
            </VisibleXSSM>
            <VisibleMDLG>
              <br />
              <span style={{ color: COLORS.GRAY }}>
                Alternatively, you can keep this project's software environment
                and upgrade later in Project Settings → Project Control.
              </span>
            </VisibleMDLG>
          </div>
          {render_controls()}
        </div>
      </Alert>
    );
  }, [compute_image, updating]);
};
