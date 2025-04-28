/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */
import { Space } from "antd";

import { alert_message } from "@cocalc/frontend/alerts";
import { Alert, Button } from "@cocalc/frontend/antd-bootstrap";
import {
  React,
  redux,
  useMemo,
  useState,
  useStore,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import {
  A,
  CloseX,
  Icon,
  Loading,
  VisibleMDLG,
} from "@cocalc/frontend/components";
import {
  DISMISS_IMG_1804,
  DISMISS_IMG_2004,
  UBUNTU2004_DEPRECATED,
  UBUNTU2004_DEV,
} from "@cocalc/util/compute-images";
import { FALLBACK_COMPUTE_IMAGE } from "@cocalc/util/db-schema/defaults";
import { KUCALC_COCALC_COM } from "@cocalc/util/db-schema/site-defaults";
import { COLORS } from "@cocalc/util/theme";
import { ALERT_STYLE } from "../warnings/common";
import { useProjectState } from "./project-state-hook";

const UPGRADE_STYLE: React.CSSProperties = {
  ...ALERT_STYLE,
  ...{ fontSize: "11pt", padding: "5px 10px" },
} as const;

const DOC_UBUNTU_2004 = "https://doc.cocalc.com/news/ubuntu-2004.html";
const DOC_UBUNTU_2204 =
  "https://cocalc.com/news/ubuntu-22-04-default-software-environment-9";
const DOC_CHANGE_SOFTWARE_IMAGE =
  "https://doc.cocalc.com/project-settings.html#software-environment";

// we only upgrade from not-frozen 18.04 and 20.04 images to the new default.
// do not bother about any other names, including ubuntu1804 and old
const TO_UPGRADE = [
  FALLBACK_COMPUTE_IMAGE,
  "previous",
  "exp",
  UBUNTU2004_DEPRECATED,
  UBUNTU2004_DEV,
] as const;

function useComputeImage(project_id) {
  const [compute_image, set_compute_image] = useState<string | undefined>(
    undefined,
  );
  const project_map = useTypedRedux("projects", "project_map");
  // ? below because reported to be null in some cases of iframe embedding.
  const current_image = project_map?.getIn([
    project_id,
    "compute_image",
  ]) as any;
  if (current_image != compute_image) {
    set_compute_image(current_image);
  }
  return current_image;
}

export const SoftwareEnvUpgrade: React.FC<{ project_id: string }> = ({
  project_id,
}) => {
  // if we're outside cocalc.com, this is not applicable. we can assume this value never changes.
  const customize_kucalc = useTypedRedux("customize", "kucalc");
  if (customize_kucalc !== KUCALC_COCALC_COM) return null;
  return <SoftwareEnvUpgradeAlert project_id={project_id} />;
};

interface Props {
  project_id: string;
}

const SoftwareEnvUpgradeAlert: React.FC<Props> = (props: Props) => {
  const { project_id } = props;
  const [updating, set_updating] = useState(false);
  const [hide, set_hide] = useState(false);
  const compute_image = useComputeImage(project_id);
  const projects_store = useStore("projects");
  const project_state = useProjectState(project_id);
  const is_running = project_state.get("state") === "running";
  const customize_software = useTypedRedux("customize", "software");
  const [software_envs, default_compute_image] = useMemo(() => {
    return [
      customize_software.get("environments")?.toJS() as any,
      customize_software.get("default"),
    ];
  }, [customize_software]);

  // don't tell students to update. Less surprises and let the teacher controls this…
  const is_student_project = projects_store.is_student_project(project_id);

  // we only want to re-render if it is really necessary. the "project_map" changes quite often…
  return useMemo(() => {
    if (hide) return null;
    if (compute_image == null) return null;
    if (TO_UPGRADE.indexOf(compute_image) == -1) return null;
    if (is_student_project) return null;

    const only2204 =
      [UBUNTU2004_DEPRECATED, UBUNTU2004_DEV].indexOf(compute_image) != -1;

    // just a safety measure, before accessing .title
    if (software_envs == null || default_compute_image == null) return null;

    // In case there is no information, we can't upgrade or fallback
    // https://github.com/sagemathinc/cocalc/issues/8141
    for (const key of [
      compute_image,
      UBUNTU2004_DEPRECATED,
      default_compute_image,
    ]) {
      if (software_envs[key] == null) return null;
    }

    const oldname = software_envs[compute_image].title;
    const name2004 = software_envs[UBUNTU2004_DEPRECATED].title;
    const name2204 = software_envs[default_compute_image].title;

    const KEEP_IMAGE = only2204 ? DISMISS_IMG_2004 : DISMISS_IMG_1804;

    async function set_image(image: string) {
      set_updating(true);
      const actions = redux.getProjectActions(project_id);
      try {
        await actions.set_compute_image(image);
        // only restart the project if it is actually running
        if (image != KEEP_IMAGE && is_running) {
          await redux.getActions("projects").restart_project(project_id);
        }
      } catch (err) {
        alert_message({ type: "error", message: err });
      } finally {
        set_updating(false);
      }
    }

    function render_control_buttons() {
      if (only2204) {
        return (
          <Button
            onClick={() => set_image(default_compute_image)}
            bsStyle={"primary"}
          >
            Upgrade
          </Button>
        );
      } else {
        return (
          <>
            <Button
              onClick={() => set_image(DISMISS_IMG_2004)}
              bsStyle={"default"}
            >
              {name2004}
            </Button>
            <Button
              onClick={() => set_image(default_compute_image)}
              bsStyle={"primary"}
            >
              {name2204}
            </Button>
          </>
        );
      }
    }

    function render_controls() {
      if (updating) {
        return <Loading text={"Updating ..."} />;
      } else {
        return (
          <Space>
            <Button onClick={() => set_image(KEEP_IMAGE)}>Keep</Button>
            {render_control_buttons()}
            <CloseX on_close={() => set_hide(true)} />
          </Space>
        );
      }
    }

    function render_update_to_2004() {
      if (only2204) return null;
      return (
        <>
          <A href={DOC_UBUNTU_2004}>{name2004}</A>,{" "}
        </>
      );
    }

    function render_main(): JSX.Element {
      return (
        <Alert
          bsStyle={"info"}
          style={UPGRADE_STYLE}
          banner
          icon={<Icon name="exclamation-triangle" />}
        >
          <div style={{ display: "flex" }}>
            <div style={{ flex: "1 1 auto" }}>
              <strong>Software Upgrade Available!</strong>{" "}
              <VisibleMDLG>
                Upgrade this project's software environment from {oldname} to{" "}
                {render_update_to_2004()}
                <strong>
                  <A href={DOC_UBUNTU_2204}>{name2204}</A>
                </strong>
                , or keep it as it is.
                <br />
                <span style={{ color: COLORS.GRAY }}>
                  You can change this any time in{" "}
                  <A
                    style={{ color: COLORS.GRAY }}
                    href={DOC_CHANGE_SOFTWARE_IMAGE}
                  >
                    Project Settings → Project Control → Software Environment
                  </A>
                  .
                </span>
              </VisibleMDLG>
            </div>
            {render_controls()}
          </div>
        </Alert>
      );
    }

    return render_main();
  }, [compute_image, updating, hide, project_state]);
};
