/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as React from "react";
import { rtypes, redux, rclass, Rendered } from "../../app-framework";
import {
  COLORS,
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
import {
  ButtonToolbar,
  Button,
  MenuItem,
  Alert,
  DropdownButton,
} from "react-bootstrap";
import { alert_message } from "../../alerts";
import { Project } from "./types";
import { Map, fromJS } from "immutable";
import { Popconfirm } from "antd";
import { StopOutlined, SyncOutlined } from "@ant-design/icons";
import { KUCALC_COCALC_COM } from "smc-util/db-schema/site-defaults";
let {
  COMPUTE_IMAGES,
  DEFAULT_COMPUTE_IMAGE,
} = require("smc-util/compute-images");
COMPUTE_IMAGES = fromJS(COMPUTE_IMAGES); // only because that's how all the ui code was written.

const { project_tasks } = require("../../project_tasks");
const misc = require("smc-util/misc");

interface ReactProps {
  project: Project;
}

interface ReduxProps {
  kucalc: string;
  images: Map<string, any>;
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
        compute_images: {
          images: rtypes.immutable.Map,
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
      // get_idle_timeout_horizon depends on the project object, so this will update properly....
      const date = redux
        .getStore("projects")
        .get_idle_timeout_horizon(this.props.project.get("project_id"));
      if (!date) {
        // e.g., viewing as admin...
        return;
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

    compute_image_info(name, type) {
      return COMPUTE_IMAGES.getIn([name, type]);
    }

    render_compute_image_items() {
      // we want "Default", "Previous", ... to come first
      // then the timestamps in newest-first
      // and then the exotic ones
      const sorter = (a, b): number => {
        const o1 = a.get("order", 0);
        const o2 = b.get("order", 0);
        if (o1 == o2) {
          return a.get("title") < b.get("title") ? 1 : -1;
        }
        return o1 > o2 ? 1 : -1;
      };
      return COMPUTE_IMAGES.sort(sorter)
        .entrySeq()
        .map(([name, data]) => {
          return (
            <MenuItem
              key={name}
              eventKey={name}
              onSelect={this.set_compute_image.bind(this)}
            >
              {data.get("title")}
            </MenuItem>
          );
        });
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
      let display;
      const current_image = this.props.project.get("compute_image");
      const name = compute_image2name(current_image);
      if (this.props.images == undefined) {
        return undefined;
      }
      const img_id = compute_image2basename(current_image);
      const img_data = this.props.images.get(img_id);
      if (img_data == undefined) {
        // this is quite unlikely, use ID as fallback
        display = img_id;
      } else {
        display = (
          <React.Fragment>
            {img_data.get("display")}
            <div style={{ color: COLORS.GRAY, fontFamily: "monospace" }}>
              ({name})
            </div>
          </React.Fragment>
        );
      }

      return (
        <div style={{ color: "#666" }}>
          <div style={{ fontSize: "11pt" }}>
            <div>
              <Icon name={"hdd"} /> Custom image:
            </div>
            {display}
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
      const default_title = this.compute_image_info(
        DEFAULT_COMPUTE_IMAGE,
        "title"
      );
      const selected_title = this.compute_image_info(selected_image, "title");

      return (
        <div style={{ color: "#666" }}>
          <div style={{ fontSize: "12pt" }}>
            <Icon name={"hdd"} />
            <Space />
            Selected image
            <Space />
            <DropdownButton
              title={
                selected_title != undefined ? selected_title : selected_image
              }
              id={selected_image}
              onToggle={(open) =>
                this.setState({ compute_image_focused: open })
              }
              onBlur={() => this.setState({ compute_image_focused: false })}
            >
              {this.render_compute_image_items()}
            </DropdownButton>
            <Space />
            {selected_image !== DEFAULT_COMPUTE_IMAGE ? (
              <span style={{ color: COLORS.GRAY, fontSize: "11pt" }}>
                <br /> (If in doubt, select "{default_title}".)
              </span>
            ) : undefined}
          </div>
          <div style={{ marginTop: "10px" }}>
            <span>
              <i>{this.compute_image_info(selected_image, "descr")}</i>
            </span>
          </div>
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

    rowstyle(delim?) {
      const style: React.CSSProperties = {
        marginBottom: "5px",
        paddingBottom: "10px",
      };
      if (delim) {
        style.borderBottom = "1px solid #ccc";
        style.borderTop = "1px solid #ccc";
      }
      return style;
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
            <pre>{this.props.project.get("project_id")}</pre>
          </LabeledRow>
          {this.render_select_compute_image_row()}
        </SettingBox>
      );
    }
  }
);
