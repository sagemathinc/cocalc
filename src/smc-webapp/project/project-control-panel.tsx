import * as async from "async";
import * as immutable from "immutable";
import { React, Component, rtypes } from "../app-framework";
import { TypedMap } from "../app-framework/TypedMap";
import { redux } from "../frame-editors/generic/test/util";
import { CSSProperties } from "react";
const { project_tasks } = require("../project_tasks");

const misc                    = require('smc-util/misc')
const {alert_message}         = require('./alerts')
const {COLORS}                = require('smc-util/theme')
const {COMPUTE_IMAGES, DEFAULT_COMPUTE_IMAGE} = require('smc-util/compute-images')
const IMMUTABLE_COMPUTE_IMAGES = immutable.fromJS(COMPUTE_IMAGES)  // only because that's how all the ui code was written.

const {Alert, Button, ButtonToolbar, Well, DropdownButton, MenuItem} = require('react-bootstrap')
const { Icon, LabeledRow, Loading, ProjectState, Space, TimeAgo} = require('./r_misc')

const {ProjectSettingsPanel} = require('./project/project-settings-support')

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
      show_ssh: false,
      compute_image: this.props.project.get("compute_image"),
      compute_image_changing: false,
      compute_image_focused: false
    };
  }

  static reduxProps = () => {
    return {
      customize: {
        kucalc: rtypes.string
      }
    };
  };

  componentWillReceiveProps(props) {
    if (this.state.compute_image_focused) {
      return;
    }
    const new_image = props.project.get("compute_image");
    if (new_image !== this.state.compute_image) {
      return this.setState({
        compute_image: new_image,
        compute_image_changing: false
      });
    }
  }

  get_this_project_actions() {
    return redux.getActions({project_id: this.props.project.get("project_id")})
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

  cancel_compute_image(current_image) {
    return this.setState({
      compute_image: current_image,
      compute_image_changing: false,
      compute_image_focused: false
    });
  }

  async save_compute_image(current_image) {
    // image is reset to the previous name and componentWillReceiveProps will set it when new
    this.setState({
      compute_image: current_image,
      compute_image_changing: true,
      compute_image_focused: false
    });
    const new_image = this.state.compute_image;
    const actions = this.get_this_project_actions()
    try {
      await actions.set_compute_image(new_image);
      return this.restart_project();
    } catch (error) {
      const err = error;
      alert_message({ type: "error", message: err });
      return this.setState({ compute_image_changing: false });
    }
  }

  set_compute_image(name) {
    return this.setState({ compute_image: name });
  }

  compute_image_info(name, type) {
    return IMMUTABLE_COMPUTE_IMAGES.getIn([name, type]);
  }

  render_compute_image_items() {
    return IMMUTABLE_COMPUTE_IMAGES.entrySeq().map(entry => {
      const [name, data] = entry;
      return (
        <MenuItem key={name} eventKey={name} onSelect={this.set_compute_image}>
          {data.get("title")}
        </MenuItem>
      );
    });
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
          {this.render_select_compute_image()}
        </LabeledRow>
      </div>
    );
  }

  render_select_compute_image_error() {
    const err = IMMUTABLE_COMPUTE_IMAGES.get("error");
    return (
      <Alert bsStyle="warning" style={{ margin: "10px" }}>
        <h4>Problem loading compute images</h4>
        <code>{err}</code>
      </Alert>
    );
  }

  render_select_compute_image() {
    const no_value = this.state.compute_image == null;
    if (no_value || this.state.compute_image_changing) {
      return <Loading />;
    }
    if (IMMUTABLE_COMPUTE_IMAGES.has("error")) {
      return this.render_select_compute_image_error();
    }
    // this will at least return a suitable default value
    const selected_image = this.state.compute_image;
    const current_image = this.props.project.get("compute_image");
    const default_title = this.compute_image_info(
      DEFAULT_COMPUTE_IMAGE,
      "title"
    );

    return (
      <div style={{ color: "#666" }}>
        <div style={{ fontSize: "12pt" }}>
          <Icon name={"hdd"} />
          <Space />
          Selected image
          <Space />
          <DropdownButton
            title={this.compute_image_info(selected_image, "title")}
            id={selected_image}
            onToggle={open => this.setState({ compute_image_focused: open })}
            onBlur={() => this.setState({ compute_image_focused: false })}
          >
            {this.render_compute_image_items()}
          </DropdownButton>
          <Space />
          {selected_image !== DEFAULT_COMPUTE_IMAGE ? (
            <span style={{ color: COLORS.GRAY, fontSize: "11pt" }}>
              <br /> (If in doubt, select "{default_title}".)
            </span>
          ) : (
            undefined
          )}
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
        ) : (
          undefined
        )}
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
