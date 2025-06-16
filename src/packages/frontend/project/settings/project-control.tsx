/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Space } from "antd";
import { FormattedMessage, useIntl } from "react-intl";

import { alert_message } from "@cocalc/frontend/alerts";
import {
  React,
  redux,
  Rendered,
  useState,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import {
  A,
  CopyToClipBoard,
  Icon,
  LabeledRow,
  Loading,
  Paragraph,
  ProjectState,
  SettingBox,
  TimeAgo,
  TimeElapsed,
} from "@cocalc/frontend/components";
import {
  CUSTOM_SOFTWARE_HELP_URL,
  is_custom_image,
} from "@cocalc/frontend/custom-software/util";
import { labels } from "@cocalc/frontend/i18n";
import {
  KUCALC_COCALC_COM,
  KUCALC_ON_PREMISES,
} from "@cocalc/util/db-schema/site-defaults";
import * as misc from "@cocalc/util/misc";
import { COMPUTE_STATES } from "@cocalc/util/schema";
import { COLORS } from "@cocalc/util/theme";
import { useProjectContext } from "../context";
import { ComputeImageSelector } from "./compute-image-selector";
import { RestartProject } from "./restart-project";
import { SOFTWARE_ENVIRONMENT_ICON } from "./software-consts";
import { SoftwareImageDisplay } from "./software-image-display";
import { StopProject } from "./stop-project";
import { Project } from "./types";

interface ReactProps {
  project: Project;
  mode?: "project" | "flyout";
}

export const ProjectControl: React.FC<ReactProps> = (props: ReactProps) => {
  const { project, mode = "project" } = props;
  const { project_id, compute_image } = useProjectContext();
  const isFlyout = mode === "flyout";
  const intl = useIntl();
  const customize_kucalc = useTypedRedux("customize", "kucalc");
  const [computeImgChanging, setComputeImgChanging] = useState<boolean>(false);

  function render_state() {
    return (
      <span style={{ fontSize: "12pt", color: COLORS.GRAY_M }}>
        <ProjectState show_desc={true} state={project.get("state")} />
      </span>
    );
  }

  function render_idle_timeout() {
    // get_idle_timeout_horizon depends on the project object, so this
    // will update properly....
    const date = redux
      .getStore("projects")
      .get_idle_timeout_horizon(project_id);
    if (date == null) {
      // e.g., viewing as admin where the info about idle timeout
      // horizon simply isn't known.
      return <span style={{ color: COLORS.GRAY_M }}>(not available)</span>;
    }
    return (
      <span style={{ color: COLORS.GRAY_M }}>
        <Icon name="hourglass-half" />{" "}
        <FormattedMessage
          id="project.settings.control.idle_timeout.info"
          defaultMessage={`<b>About {ago}</b> project will stop unless somebody actively edits.`}
          values={{ ago: <TimeAgo date={date} /> }}
        />
      </span>
    );
  }

  async function restart_project() {
    await redux.getActions("projects").restart_project(project_id);
  }

  function render_stop_button(commands): Rendered {
    return (
      <StopProject
        size={isFlyout ? "small" : "large"}
        project_id={project_id}
        disabled={!commands.includes("stop")}
      />
    );
  }

  function render_restart_button(commands): Rendered {
    return (
      <RestartProject
        size={isFlyout ? "small" : "large"}
        project_id={project_id}
        disabled={!commands.includes("start") && !commands.includes("stop")}
      />
    );
  }

  function render_action_buttons(): Rendered {
    const state = project.getIn(["state", "state"]);
    const commands = (state &&
      COMPUTE_STATES[state] &&
      COMPUTE_STATES[state].commands) || ["save", "stop", "start"];
    return (
      <Space.Compact
        style={{ marginTop: "10px", marginBottom: "10px" }}
        size={isFlyout ? "small" : "large"}
      >
        {render_restart_button(commands)}
        {render_stop_button(commands)}
      </Space.Compact>
    );
  }

  function render_idle_timeout_row() {
    if (project.getIn(["state", "state"]) !== "running") {
      return;
    }
    if (redux.getStore("projects").is_always_running(project_id)) {
      return (
        <LabeledRow
          key="idle-timeout"
          label={intl.formatMessage(labels.always_running)}
          style={rowStyle()}
          vertical={isFlyout}
        >
          <Paragraph>
            <FormattedMessage
              id="project.settings.control.idle_timeout.always_running.info"
              defaultMessage={`Project will be <b>automatically started</b> if it stops
                for any reason (it will run any <A>init scripts</A>).`}
              values={{
                A: (c) => (
                  <A href="https://doc.cocalc.com/project-init.html">{c}</A>
                ),
              }}
            />
          </Paragraph>
        </LabeledRow>
      );
    }
    return (
      <LabeledRow
        key="idle-timeout"
        label={intl.formatMessage(labels.idle_timeout)}
        style={rowStyle()}
        vertical={isFlyout}
      >
        {render_idle_timeout()}
      </LabeledRow>
    );
  }

  function render_uptime() {
    // start_ts is a timestamp, e.g. 1508576664416
    const start_ts = project.getIn(["status", "start_ts"]);
    if (typeof start_ts !== "number") return;
    if (project.getIn(["state", "state"]) !== "running") {
      return;
    }

    return (
      <LabeledRow
        key="uptime"
        label={intl.formatMessage(labels.uptime)}
        style={rowStyle()}
        vertical={isFlyout}
      >
        <span style={{ color: COLORS.GRAY_M }}>
          <Icon name="clock" />{" "}
          <FormattedMessage
            id="project.settings.control.uptime.info"
            defaultMessage={`Project started <b>{ago}</b> ago`}
            values={{ ago: <TimeElapsed start_ts={start_ts} /> }}
          />
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
      <LabeledRow
        key="cpu-usage"
        label={intl.formatMessage({
          id: "project.settings.control.cpu_usage.label",
          defaultMessage: "CPU Usage",
        })}
        style={rowStyle(true)}
        vertical={isFlyout}
      >
        <span style={{ color: COLORS.GRAY_M }}>
          <Icon name="calculator" />{" "}
          <FormattedMessage
            id="project.settings.control.cpu_usage.info"
            defaultMessage={`used <b>{cpu_str}</b> of CPU time since project started`}
            values={{ cpu_str }}
          />
        </span>
      </LabeledRow>
    );
  }

  async function saveSelectedComputeImage(new_image: string) {
    const actions = redux.getProjectActions(project_id);
    try {
      setComputeImgChanging(true);
      await actions.set_compute_image(new_image);
      await restart_project();
    } catch (err) {
      alert_message({ type: "error", message: err });
    } finally {
      setComputeImgChanging(false);
    }
  }

  function render_select_compute_image_row() {
    if (![KUCALC_COCALC_COM, KUCALC_ON_PREMISES].includes(customize_kucalc)) {
      return;
    }

    return (
      <div style={{ marginTop: "10px" }}>
        <LabeledRow
          key="cpu-usage"
          label={intl.formatMessage(labels.software_environment)}
          style={rowStyle(true)}
          vertical={isFlyout}
        >
          {render_select_compute_image()}
        </LabeledRow>
      </div>
    );
  }

  function render_custom_compute_image() {
    return (
      <div style={{ color: COLORS.GRAY_M }}>
        <div style={{ fontSize: "11pt" }}>
          <div>
            <Icon name={SOFTWARE_ENVIRONMENT_ICON} /> Custom image:
          </div>
          <SoftwareImageDisplay image={compute_image} />
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

  function render_select_compute_image() {
    if (compute_image == null) {
      return <Loading />;
    }

    if (is_custom_image(compute_image)) {
      return render_custom_compute_image();
    }

    return (
      <ComputeImageSelector
        current_image={compute_image}
        layout={"dialog"}
        onSelect={saveSelectedComputeImage}
        changing={computeImgChanging}
        hideCustomImages={true}
        label={intl.formatMessage({
          id: "project.settings.compute-image-selector.button.save-restart",
          defaultMessage: "Save and Restart",
        })}
      />
    );
  }

  function rowStyle(delim?): React.CSSProperties | undefined {
    if (!delim) return;
    return {
      borderBottom: "1px solid #ddd",
      borderTop: "1px solid #ddd",
      paddingBottom: isFlyout ? undefined : "10px",
      paddingTop: "10px",
      marginBottom: "10px",
    };
  }

  function render_project_id() {
    return (
      <LabeledRow key="project_id" label="Project ID" vertical={isFlyout}>
        {!isFlyout ? (
          <CopyToClipBoard
            inputWidth={"330px"}
            value={project_id}
            style={{ display: "inline-block", width: "100%", margin: 0 }}
          />
        ) : (
          <Paragraph
            copyable={{
              text: project_id,
              tooltips: ["Copy Project ID", "Copied!"],
            }}
            code
            style={{ marginBottom: 0 }}
          >
            {project_id}
          </Paragraph>
        )}
      </LabeledRow>
    );
  }

  function renderBody() {
    return (
      <>
        <LabeledRow key="action" label="Actions" vertical={isFlyout}>
          {render_action_buttons()}
        </LabeledRow>
        <LabeledRow
          key="state"
          label="State"
          style={rowStyle(true)}
          vertical={isFlyout}
        >
          {render_state()}
        </LabeledRow>
        {render_idle_timeout_row()}
        {render_uptime()}
        {render_cpu_usage()}
        {render_project_id()}
        {render_select_compute_image_row()}
      </>
    );
  }

  if (mode === "flyout") {
    return renderBody();
  } else {
    return (
      <SettingBox title="Project Control" icon="gears">
        {renderBody()}
      </SettingBox>
    );
  }
};
