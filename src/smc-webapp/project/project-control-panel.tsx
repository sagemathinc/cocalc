import * as async from "async";
import { React, Component, rtypes } from "../app-framework";
import { TypedMap } from "../app-framework/TypedMap";
import { redux } from "../frame-editors/generic/test/util";
import { CSSProperties } from "react";
import { ComputeImageSelector } from "../misc/compute-image-selector";
const { project_tasks } = require("../project_tasks");

const misc = require("smc-util/misc");
const { Button, ButtonToolbar, Well } = require("react-bootstrap");
const { Icon, LabeledRow, ProjectState, TimeAgo } = require("./r_misc");

const { ProjectSettingsPanel } = require("./project/project-settings-support");

/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS103: Rewrite code to no longer use __guard__
 * DS207: Consider shorter variations of null checks
 * DS208: Avoid top-level this
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */

type ProjectInfo = TypedMap<{
  compute_image: string;
  project_id: string;
  state: string;
}>;

interface ReactProps {
  project: ProjectInfo;
}

interface ReduxProps {
  kucalc: string;
}

interface StateTypes {
  compute_image: string;
  compute_image_changing: boolean;
  compute_image_focused: boolean;
  compute_image_info: ProjectInfo;
  restart: boolean;
  show_stop_confirmation: boolean;
}

export class ProjectControlPanel extends Component<
  ReactProps & ReduxProps,
  StateTypes
> {
  displayName: "ProjectSettings-ProjectControlPanel";

  getInitialState() {
    return {
      restart: false,
      show_ssh: false
    };
  }

  static reduxProps = () => {
    return {
      customize: {
        kucalc: rtypes.string
      }
    };
  };

  get_this_project_actions() {
    return redux.getActions({
      project_id: this.props.project.get("project_id")
    });
  }

  get_projects_actions() {
    return redux.getActions("projects");
  }

  open_authorized_keys(e) {
    e.preventDefault();
    const project_id = this.props.project.get("project_id");
    return async.series([
      cb => {
        return project_tasks(project_id).ensure_directory_exists({
          path: ".ssh",
          cb
        });
      },
      cb => {
        this.get_this_project_actions().open_file({
          path: ".ssh/authorized_keys",
          foreground: true
        });
        return cb();
      }
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

  restart_project() {
    return this.get_projects_actions().restart_project(
      this.props.project.get("project_id")
    );
  }

  stop_project() {
    return this.get_projects_actions().stop_project(
      this.props.project.get("project_id")
    );
  }

  render_confirm_restart() {
    if (this.state.restart) {
      return (
        <LabeledRow key="restart" label="">
          <Well>
            Restarting the project server will kill all processes, update the
            project code, and start the project running again. It takes a few
            seconds, and can fix some issues in case things are not working
            properly.
            <hr />
            <ButtonToolbar>
              <Button
                bsStyle="warning"
                onClick={e => {
                  e.preventDefault();
                  this.setState({ restart: false });
                  return this.restart_project();
                }}
              >
                <Icon name="refresh" /> Restart Project Server
              </Button>
              <Button
                onClick={e => {
                  e.preventDefault();
                  return this.setState({ restart: false });
                }}
              >
                Cancel
              </Button>
            </ButtonToolbar>
          </Well>
        </LabeledRow>
      );
    }
  }

  render_confirm_stop() {
    if (this.state.show_stop_confirmation) {
      return (
        <LabeledRow key="stop" label="">
          <Well>
            Stopping the project server will kill all processes. After stopping
            a project, it will not start until a collaborator restarts the
            project.
            <hr />
            <ButtonToolbar>
              <Button
                bsStyle="warning"
                onClick={e => {
                  e.preventDefault();
                  this.setState({ show_stop_confirmation: false });
                  return this.stop_project();
                }}
              >
                <Icon name="stop" /> Stop Project Server
              </Button>
              <Button
                onClick={e => {
                  e.preventDefault();
                  return this.setState({ show_stop_confirmation: false });
                }}
              >
                Cancel
              </Button>
            </ButtonToolbar>
          </Well>
        </LabeledRow>
      );
    }
  }

  render_action_buttons() {
    const { COMPUTE_STATES } = require("smc-util/schema");
    const state = __guard__(this.props.project.get("state"), x =>
      x.get("state")
    );
    const commands =
      (COMPUTE_STATES[state] != null
        ? COMPUTE_STATES[state].commands
        : undefined) != null
        ? COMPUTE_STATES[state] != null
          ? COMPUTE_STATES[state].commands
          : undefined
        : ["save", "stop", "start"];
    return (
      <ButtonToolbar style={{ marginTop: "10px", marginBottom: "10px" }}>
        <Button
          bsStyle="warning"
          disabled={!commands.includes("start") && !commands.includes("stop")}
          onClick={e => {
            e.preventDefault();
            return this.setState({
              show_stop_confirmation: false,
              restart: true
            });
          }}
        >
          <Icon name="refresh" /> Restart Project...
        </Button>
        <Button
          bsStyle="warning"
          disabled={!commands.includes("stop")}
          onClick={e => {
            e.preventDefault();
            return this.setState({
              show_stop_confirmation: true,
              restart: false
            });
          }}
        >
          <Icon name="stop" /> Stop Project...
        </Button>
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
    if (start_ts == null) {
      return;
    }
    if (this.props.project.getIn(["state", "state"]) !== "running") {
      return;
    }
    const delta_s = (misc.server_time().getTime() - start_ts) / 1000;
    const uptime_str = misc.seconds2hms(delta_s, true);
    return (
      <LabeledRow key="uptime" label="Uptime" style={this.rowstyle()}>
        <span style={{ color: "#666" }}>
          <Icon name="clock-o" /> project started <b>{uptime_str}</b> ago
        </span>
      </LabeledRow>
    );
  }

  render_cpu_usage() {
    const cpu = this.props.project.getIn(["status", "cpu", "usage"]);
    if (cpu == null) {
      return;
    }
    if (this.props.project.getIn(["state", "state"]) !== "running") {
      return;
    }
    const cpu_str = misc.seconds2hms(cpu, true);
    return (
      <LabeledRow key="cpu-usage" label="CPU Usage" style={this.rowstyle(true)}>
        <span style={{ color: "#666" }}>
          <Icon name="calculator" /> used <b>{cpu_str}</b> of CPU time since
          project started
        </span>
      </LabeledRow>
    );
  }

  render_select_compute_image_row() {
    if (this.props.kucalc !== "yes") {
      return;
    }
    return (
      <div>
        <LabeledRow
          key="cpu-usage"
          label="Software Environment"
          style={this.rowstyle(true)}
        >
          <ComputeImageSelector
            current_compute_image={this.props.project.get("compute_image")}
            project_id={this.props.project.get("project_id")}
          />
        </LabeledRow>
      </div>
    );
  }

  rowstyle(delim?) {
    const style: CSSProperties = {
      marginBottom: "5px",
      paddingBottom: "10px"
    };
    if (delim) {
      style.borderBottom = "1px solid #ccc";
      style.borderTop = "1px solid #ccc";
    }
    return style;
  }

  render() {
    return (
      <ProjectSettingsPanel title="Project control" icon="gears">
        <LabeledRow key="state" label="State" style={this.rowstyle(true)}>
          {this.render_state()}
        </LabeledRow>
        {this.render_idle_timeout_row()}
        {this.render_uptime()}
        {this.render_cpu_usage()}
        <LabeledRow key="action" label="Actions">
          {this.render_action_buttons()}
        </LabeledRow>
        {this.render_confirm_restart()}
        {this.render_confirm_stop()}
        <LabeledRow key="project_id" label="Project id">
          <pre>{this.props.project.get("project_id")}</pre>
        </LabeledRow>
        {this.props.kucalc !== "yes" ? <hr /> : undefined}
        {this.render_select_compute_image_row()}
      </ProjectSettingsPanel>
    );
  }
}
function __guard__(value, transform) {
  return typeof value !== "undefined" && value !== null
    ? transform(value)
    : undefined;
}
