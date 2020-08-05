/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import {
  React,
  useTypedRedux,
  rtypes,
  redux,
  rclass,
  Rendered,
} from "../../app-framework";
import {
  A,
  COLORS,
  CopyToClipBoard,
  Loading,
  ProjectState,
  TimeAgo,
  LabeledRow,
  TimeElapsed,
  Space,
  Icon,
  SettingBox,
} from "../../r_misc";
import {
  CUSTOM_SOFTWARE_HELP_URL,
  compute_image2name,
  compute_image2basename,
  CUSTOM_IMG_PREFIX,
} from "../../custom-software/util";
import { async } from "async";
import { ButtonToolbar, Button, Alert } from "react-bootstrap";
import { alert_message } from "../../alerts";
import { Project } from "./types";
import { fromJS } from "immutable";
import { Popconfirm } from "antd";
import { StopOutlined, SyncOutlined } from "@ant-design/icons";
import { KUCALC_COCALC_COM } from "smc-util/db-schema/site-defaults";
import { ComputeImageSelector } from "./compute-image-selector";
import { COMPUTE_IMAGES as COMPUTE_IMAGES_ORIG } from "smc-util/compute-images";
const COMPUTE_IMAGES = fromJS(COMPUTE_IMAGES_ORIG); // only because that's how all the ui code was written.

const { project_tasks } = require("../../project_tasks");
const misc = require("smc-util/misc");

interface ReactProps {
  project: Project;
}

interface ReduxProps {
  kucalc: string;
}

interface State {
  show_ssh: boolean;
  compute_image: string;
  compute_image_changing: boolean;
  compute_image_focused: boolean;
}

export const ProjectControl = rclass<ReactProps>(
  class ProjectControl extends React.Component<ReactProps & ReduxProps, State> {
    static reduxProps() {
      return {
        customize: {
          kucalc: rtypes.string,
        },
      };
    }

    constructor(props) {
      super(props);
      this.state = {
        show_ssh: false,
        compute_image: this.props.project.get("compute_image"),
        compute_image_changing: false,
        compute_image_focused: false,
      };
    }

    componentWillReceiveProps(props) {
      if (this.state.compute_image_focused) {
        return;
      }
      const new_image = props.project.get("compute_image");
      if (new_image !== this.state.compute_image) {
        return this.setState({
          compute_image: new_image,
          compute_image_changing: false,
        });
      }
    }

    open_authorized_keys(e) {
      e.preventDefault();
      const project_id = this.props.project.get("project_id");
      return async.series([
        (cb) => {
          return project_tasks(project_id).ensure_directory_exists({
            path: ".ssh",
            cb,
          });
        },
        (cb) => {
          redux.getActions({ project_id }).open_file({
            path: ".ssh/authorized_keys",
            foreground: true,
          });
          return cb();
        },
      ]);
    }

    render_state() {
      return (
        <span style={{ fontSize: "12pt", color: "#666" }}>
          <ProjectState
            show_desc={true}
            state={this.props.project.get("state")}
          />
        </span>
      );
    }

    render_idle_timeout() {
      // get_idle_timeout_horizon depends on the project object, so this
      // will update properly....
      const date = redux
        .getStore("projects")
        .get_idle_timeout_horizon(this.props.project.get("project_id"));
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

    restart_project = () => {
      redux
        .getActions("projects")
        .restart_project(this.props.project.get("project_id"));
    };

    stop_project = () => {
      redux
        .getActions("projects")
        .stop_project(this.props.project.get("project_id"));
    };

    render_stop_button(commands): Rendered {
      const text = (
        <div style={{ maxWidth: "300px" }}>
          Stopping the project server will kill all processes. After stopping a
          project, it will not start until you or a collaborator restarts the
          project.
        </div>
      );

      return (
        <Popconfirm
          placement={"bottom"}
          arrowPointAtCenter={true}
          title={text}
          icon={<StopOutlined />}
          onConfirm={() => this.stop_project()}
          okText="Yes, stop project"
          cancelText="Cancel"
        >
          <Button bsStyle="warning" disabled={!commands.includes("stop")}>
            <Icon name="stop" /> Stop Project...
          </Button>
        </Popconfirm>
      );
    }

    render_restart_button(commands): Rendered {
      const text = (
        <div style={{ maxWidth: "300px" }}>
          Restarting the project server will terminate all processes, update the
          project code, and start the project running again. It takes a few
          seconds, and can fix some issues in case things are not working
          properly. You'll not lose any files, but you have to start your
          notebooks and worksheets again.
        </div>
      );

      return (
        <Popconfirm
          placement={"bottom"}
          arrowPointAtCenter={true}
          title={text}
          icon={<SyncOutlined />}
          onConfirm={() => this.restart_project()}
          okText="Yes, restart project"
          cancelText="Cancel"
        >
          <Button
            disabled={!commands.includes("start") && !commands.includes("stop")}
            bsStyle="warning"
          >
            <Icon name="refresh" /> Restart Project…
          </Button>
        </Popconfirm>
      );
    }

    render_action_buttons(): Rendered {
      const { COMPUTE_STATES } = require("smc-util/schema");
      const state = this.props.project.getIn(["state", "state"]);
      const commands = (state &&
        COMPUTE_STATES[state] &&
        COMPUTE_STATES[state].commands) || ["save", "stop", "start"];
      return (
        <ButtonToolbar style={{ marginTop: "10px", marginBottom: "10px" }}>
          {this.render_restart_button(commands)}
          {this.render_stop_button(commands)}
        </ButtonToolbar>
      );
    }

    render_idle_timeout_row() {
      if (this.props.project.getIn(["state", "state"]) !== "running") {
        return;
      }
      if (this.props.project.getIn(["settings", "always_running"])) {
        return (
          <LabeledRow
            key="idle-timeout"
            label="Always Running"
            style={this.rowstyle()}
          >
            Project will be <b>automatically started</b> if it stops for any
            reason (it will run any{" "}
            <A href="https://doc.cocalc.com/project-init.html">init scripts</A>
            ).
          </LabeledRow>
        );
      }
      return (
        <LabeledRow
          key="idle-timeout"
          label="Idle Timeout"
          style={this.rowstyle()}
        >
          {this.render_idle_timeout()}
        </LabeledRow>
      );
    }

    render_uptime() {
      // start_ts is e.g. 1508576664416
      const start_ts = this.props.project.getIn(["status", "start_ts"]);
      if (start_ts == undefined) {
        return;
      }
      if (this.props.project.getIn(["state", "state"]) !== "running") {
        return;
      }

      return (
        <LabeledRow key="uptime" label="Uptime" style={this.rowstyle()}>
          <span style={{ color: "#666" }}>
            <Icon name="clock-o" /> project started{" "}
            <b>{<TimeElapsed start_ts={start_ts} />}</b> ago
          </span>
        </LabeledRow>
      );
    }

    render_cpu_usage() {
      const cpu = this.props.project.getIn(["status", "cpu", "usage"]);
      if (cpu == undefined) {
        return;
      }
      if (this.props.project.getIn(["state", "state"]) !== "running") {
        return;
      }
      const cpu_str = misc.seconds2hms(cpu, true);
      return (
        <LabeledRow
          key="cpu-usage"
          label="CPU Usage"
          style={this.rowstyle(true)}
        >
          <span style={{ color: "#666" }}>
            <Icon name="calculator" /> used <b>{cpu_str}</b> of CPU time since
            project started
          </span>
        </LabeledRow>
      );
    }

    cancel_compute_image = (current_image) => {
      this.setState({
        compute_image: current_image,
        compute_image_changing: false,
        compute_image_focused: false,
      });
    };

    save_compute_image = async (current_image) => {
      // image is reset to the previous name and componentWillReceiveProps will set it when new
      this.setState({
        compute_image: current_image,
        compute_image_changing: true,
        compute_image_focused: false,
      });
      const new_image = this.state.compute_image;
      const actions = redux.getProjectActions(
        this.props.project.get("project_id")
      );
      try {
        await actions.set_compute_image(new_image);
        this.restart_project();
      } catch (err) {
        alert_message({ type: "error", message: err });
        this.setState({ compute_image_changing: false });
      }
    };

    set_compute_image(name) {
      this.setState({ compute_image: name });
    }

    render_select_compute_image_row() {
      if (this.props.kucalc !== KUCALC_COCALC_COM) {
        return;
      }
      return (
        <>
          <hr />
          <div>
            <LabeledRow
              key="cpu-usage"
              label="Software Environment"
              style={this.rowstyle(true)}
            >
              {this.render_select_compute_image()}
            </LabeledRow>
          </div>
        </>
      );
    }

    render_select_compute_image_error() {
      const err = COMPUTE_IMAGES.get("error");
      return (
        <Alert bsStyle="warning" style={{ margin: "10px" }}>
          <h4>Problem loading compute images</h4>
          <code>{err}</code>
        </Alert>
      );
    }

    render_custom_compute_image() {
      return (
        <div style={{ color: "#666" }}>
          <div style={{ fontSize: "11pt" }}>
            <div>
              <Icon name={"hdd"} /> Custom image:
            </div>
            <CustomImageDisplay
              image={this.props.project.get("compute_image")}
            />
            <Space />
            <span style={{ color: COLORS.GRAY, fontSize: "11pt" }}>
              <br /> You cannot change a custom software image. Instead, create
              a new project and select it there.{" "}
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

    render_select_compute_image() {
      const current_image = this.props.project.get("compute_image");
      if (current_image == undefined) {
        return;
      }

      if (current_image.startsWith(CUSTOM_IMG_PREFIX)) {
        return this.render_custom_compute_image();
      }

      const no_value = this.state.compute_image == undefined;
      if (no_value || this.state.compute_image_changing) {
        return <Loading />;
      }

      if (COMPUTE_IMAGES.has("error")) {
        return this.render_select_compute_image_error();
      }

      // this will at least return a suitable default value
      const selected_image = this.state.compute_image;

      return (
        <div style={{ color: COLORS.GRAY }}>
          <ComputeImageSelector
            selected_image={selected_image}
            // onToggle={(open) => this.setState({ compute_image_focused: open })}
            onFocus={() => this.setState({ compute_image_focused: true })}
            onBlur={() => this.setState({ compute_image_focused: false })}
            onSelect={(img) => this.set_compute_image(img)}
          />

          {selected_image !== current_image ? (
            <div style={{ marginTop: "10px" }}>
              <Button
                onClick={() => this.save_compute_image(current_image)}
                bsStyle="warning"
              >
                Save and Restart
              </Button>
              <Space />
              <Button onClick={() => this.cancel_compute_image(current_image)}>
                Cancel
              </Button>
            </div>
          ) : undefined}
        </div>
      );
    }

    private rowstyle(delim?): React.CSSProperties | undefined {
      if (!delim) return;
      return {
        borderBottom: "1px solid #ddd",
        borderTop: "1px solid #ddd",
        paddingBottom: "10px",
      };
    }

    render() {
      return (
        <SettingBox title="Project control" icon="gears">
          <LabeledRow key="state" label="State" style={this.rowstyle(true)}>
            {this.render_state()}
          </LabeledRow>
          {this.render_idle_timeout_row()}
          {this.render_uptime()}
          {this.render_cpu_usage()}
          <LabeledRow key="action" label="Actions">
            {this.render_action_buttons()}
          </LabeledRow>
          <LabeledRow key="project_id" label="Project id">
            <CopyToClipBoard
              value={this.props.project.get("project_id")}
              style={{ display: "inline-block", width: "50ex", margin: 0 }}
            />
          </LabeledRow>
          {this.render_select_compute_image_row()}
        </SettingBox>
      );
    }
  }
);

interface DisplayProps {
  image?: string;
}
export const CustomImageDisplay: React.FC<DisplayProps> = ({ image }) => {
  const images = useTypedRedux("compute_images", "images");
  if (images == null) {
    return <Loading />;
  }
  if (!image) {
    return <>Default</>;
  }
  const name = compute_image2name(image);
  const img_id = compute_image2basename(image);
  const img_data = images.get(img_id);
  if (img_data == undefined) {
    // this is quite unlikely, use ID as fallback
    return <>{img_id}</>;
  } else {
    return (
      <>
        {img_data.get("display")}{" "}
        <span style={{ color: COLORS.GRAY, fontFamily: "monospace" }}>
          ({name})
        </span>
      </>
    );
  }
};
