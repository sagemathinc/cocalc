/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import {
  React,
  redux,
  Rendered,
  useEffect,
  useState,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import {
  A,
  CopyToClipBoard,
  Icon,
  LabeledRow,
  Loading,
  ProjectState,
  SettingBox,
  TimeAgo,
  TimeElapsed,
} from "@cocalc/frontend/components";
import {
  CUSTOM_IMG_PREFIX,
  CUSTOM_SOFTWARE_HELP_URL,
} from "@cocalc/frontend/custom-software/util";
import { COMPUTE_IMAGES as COMPUTE_IMAGES_ORIG } from "@cocalc/util/compute-images";
import { KUCALC_COCALC_COM } from "@cocalc/util/db-schema/site-defaults";
import * as misc from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { Space } from "antd";
import { fromJS } from "immutable";
import { Alert, Button, ButtonToolbar } from "react-bootstrap";
import { alert_message } from "../../alerts";
import { ComputeImageSelector } from "./compute-image-selector";
import { RestartProject } from "./restart-project";
import { SoftwareImageDisplay } from "./software-image-display";
import { StopProject } from "./stop-project";
import { Project } from "./types";
const COMPUTE_IMAGES = fromJS(COMPUTE_IMAGES_ORIG); // only because that's how all the ui code was written.

interface ReactProps {
  project: Project;
}

export const ProjectControl: React.FC<ReactProps> = (props: ReactProps) => {
  const { project } = props;
  const customize_kucalc = useTypedRedux("customize", "kucalc");

  //const    [show_ssh, set_show_ssh] = useState<boolean>(false)
  const [compute_image, set_compute_image] = useState<string>(
    project.get("compute_image")
  );
  const [compute_image_changing, set_compute_image_changing] =
    useState<boolean>(false);
  const [compute_image_focused, set_compute_image_focused] =
    useState<boolean>(false);

  useEffect(() => {
    if (compute_image_focused) return;
    const new_image = project.get("compute_image");
    if (new_image !== compute_image) {
      set_compute_image(new_image);
      set_compute_image_changing(false);
    }
  }, [compute_image_focused, project.get("compute_image")]);

  function render_state() {
    return (
      <span style={{ fontSize: "12pt", color: "#666" }}>
        <ProjectState show_desc={true} state={project.get("state")} />
      </span>
    );
  }

  function render_idle_timeout() {
    // get_idle_timeout_horizon depends on the project object, so this
    // will update properly....
    const date = redux
      .getStore("projects")
      .get_idle_timeout_horizon(project.get("project_id"));
    if (date == null) {
      // e.g., viewing as admin where the info about idle timeout
      // horizon simply isn't known.
      return <span style={{ color: "#666" }}>(not available)</span>;
    }
    return (
      <span style={{ color: "#666" }}>
        <Icon name="hourglass-half" />{" "}
        <b>
          About <TimeAgo date={date} />
        </b>{" "}
        project will stop unless somebody actively edits.
      </span>
    );
  }

  async function restart_project() {
    await redux
      .getActions("projects")
      .restart_project(project.get("project_id"));
  }

  function render_stop_button(commands): Rendered {
    return (
      <Space>
        {" "}
        <StopProject
          project_id={project.get("project_id")}
          disabled={!commands.includes("stop")}
        />
      </Space>
    );
  }

  function render_restart_button(commands): Rendered {
    return (
      <Space>
        {" "}
        <RestartProject
          project_id={project.get("project_id")}
          disabled={!commands.includes("start") && !commands.includes("stop")}
        />{" "}
      </Space>
    );
  }

  function render_action_buttons(): Rendered {
    const { COMPUTE_STATES } = require("@cocalc/util/schema");
    const state = project.getIn(["state", "state"]);
    const commands = (state &&
      COMPUTE_STATES[state] &&
      COMPUTE_STATES[state].commands) || ["save", "stop", "start"];
    return (
      <ButtonToolbar style={{ marginTop: "10px", marginBottom: "10px" }}>
        {render_restart_button(commands)}
        {render_stop_button(commands)}
      </ButtonToolbar>
    );
  }

  function render_idle_timeout_row() {
    if (project.getIn(["state", "state"]) !== "running") {
      return;
    }
    if (
      redux.getStore("projects").is_always_running(project.get("project_id"))
    ) {
      return (
        <LabeledRow
          key="idle-timeout"
          label="Always Running"
          style={rowstyle()}
        >
          Project will be <b>automatically started</b> if it stops for any
          reason (it will run any{" "}
          <A href="https://doc.cocalc.com/project-init.html">init scripts</A>
          ).
        </LabeledRow>
      );
    }
    return (
      <LabeledRow key="idle-timeout" label="Idle Timeout" style={rowstyle()}>
        {render_idle_timeout()}
      </LabeledRow>
    );
  }

  function render_uptime() {
    // start_ts is e.g. 1508576664416
    const start_ts = project.getIn(["status", "start_ts"]);
    if (start_ts == undefined) return;
    if (project.getIn(["state", "state"]) !== "running") {
      return;
    }

    return (
      <LabeledRow key="uptime" label="Uptime" style={rowstyle()}>
        <span style={{ color: "#666" }}>
          <Icon name="clock" /> project started{" "}
          <b>{<TimeElapsed start_ts={start_ts} />}</b> ago
        </span>
      </LabeledRow>
    );
  }

  function render_cpu_usage() {
    const cpu = project.getIn(["status", "cpu", "usage"]);
    if (cpu == undefined) {
      return;
    }
    if (project.getIn(["state", "state"]) !== "running") {
      return;
    }
    const cpu_str = misc.seconds2hms(cpu, true);
    return (
      <LabeledRow key="cpu-usage" label="CPU Usage" style={rowstyle(true)}>
        <span style={{ color: "#666" }}>
          <Icon name="calculator" /> used <b>{cpu_str}</b> of CPU time since
          project started
        </span>
      </LabeledRow>
    );
  }

  function cancel_compute_image(current_image) {
    set_compute_image(current_image);
    set_compute_image_changing(false);
    set_compute_image_focused(false);
  }

  async function save_compute_image(current_image) {
    set_compute_image(current_image);
    set_compute_image_focused(false);
    set_compute_image_changing(true);
    const new_image = compute_image;
    const actions = redux.getProjectActions(project.get("project_id"));
    try {
      await actions.set_compute_image(new_image);
      await restart_project();
    } catch (err) {
      alert_message({ type: "error", message: err });
    } finally {
      set_compute_image_changing(false);
    }
  }

  function render_select_compute_image_row() {
    if (customize_kucalc !== KUCALC_COCALC_COM) {
      return;
    }
    return (
      <>
        <hr />
        <div>
          <LabeledRow
            key="cpu-usage"
            label="Software Environment"
            style={rowstyle(true)}
          >
            {render_select_compute_image()}
          </LabeledRow>
        </div>
      </>
    );
  }

  function render_select_compute_image_error() {
    const err = COMPUTE_IMAGES.get("error");
    return (
      <Alert bsStyle="warning" style={{ margin: "10px" }}>
        <h4>Problem loading compute images</h4>
        <code>{err}</code>
      </Alert>
    );
  }

  function render_custom_compute_image() {
    return (
      <div style={{ color: "#666" }}>
        <div style={{ fontSize: "11pt" }}>
          <div>
            <Icon name={"hdd"} /> Custom image:
          </div>
          <SoftwareImageDisplay image={project.get("compute_image")} />
          &nbsp;
          <span style={{ color: COLORS.GRAY, fontSize: "11pt" }}>
            <br /> You cannot change a custom software image. Instead, create a
            new project and select it there.{" "}
            <a
              href={CUSTOM_SOFTWARE_HELP_URL}
              target={"_blank"}
              rel={"noopener"}
            >
              Learn more...
            </a>
          </span>
        </div>
      </div>
    );
  }

  function onBlur() {
    // don't unfocus when we selected a different compute image
    // this will be set to false after either selecting "save&restart" or "cancel"
    if (project.get("compute_image") === compute_image) {
      set_compute_image_focused(false);
    }
  }

  function render_select_compute_image() {
    const current_image = project.get("compute_image");
    if (current_image == null) {
      return;
    }

    if (current_image.startsWith(CUSTOM_IMG_PREFIX)) {
      return render_custom_compute_image();
    }

    const no_value = compute_image == null;
    if (no_value || compute_image_changing) {
      return <Loading />;
    }

    if (COMPUTE_IMAGES.has("error")) {
      return render_select_compute_image_error();
    }

    // this will at least return a suitable default value
    const selected_image = compute_image;

    return (
      <div style={{ color: COLORS.GRAY }}>
        <ComputeImageSelector
          selected_image={selected_image}
          layout={"vertical"}
          onFocus={() => set_compute_image_focused(true)}
          onBlur={onBlur}
          onSelect={(img) => set_compute_image(img)}
        />

        {selected_image !== current_image ? (
          <div style={{ marginTop: "10px" }}>
            <Button
              onClick={() => save_compute_image(current_image)}
              bsStyle="warning"
            >
              Save and Restart
            </Button>
            &nbsp;
            <Button onClick={() => cancel_compute_image(current_image)}>
              Cancel
            </Button>
          </div>
        ) : undefined}
      </div>
    );
  }

  function rowstyle(delim?): React.CSSProperties | undefined {
    if (!delim) return;
    return {
      borderBottom: "1px solid #ddd",
      borderTop: "1px solid #ddd",
      paddingBottom: "10px",
    };
  }

  return (
    <SettingBox title="Project control" icon="gears">
      <LabeledRow key="state" label="State" style={rowstyle(true)}>
        {render_state()}
      </LabeledRow>
      {render_idle_timeout_row()}
      {render_uptime()}
      {render_cpu_usage()}
      <LabeledRow key="action" label="Actions">
        {render_action_buttons()}
      </LabeledRow>
      <LabeledRow key="project_id" label="Project id">
        <CopyToClipBoard
          value={project.get("project_id")}
          style={{ display: "inline-block", width: "50ex", margin: 0 }}
        />
      </LabeledRow>
      {render_select_compute_image_row()}
    </SettingBox>
  );
};
