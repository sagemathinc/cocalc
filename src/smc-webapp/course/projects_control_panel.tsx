// CoCalc libraries
const misc = require("smc-util/misc");
// React libraries and Components
import { React, rclass, rtypes, Component } from "../app-framework";
const {
  Alert,
  Button,
  ButtonToolbar,
  Row,
  Col,
  Panel
} = require("react-bootstrap");

// CoCalc Components
const { Icon, LabeledRow } = require("../r_misc");

import { CourseActions } from "./actions";
import { redux } from "../frame-editors/generic/test/util";
import { ProjectMap } from "../todo-types";
import { ComputeImageSelector } from "../misc/compute-image-selector";

interface ReactProps {
  name: string;
  num_running_projects: number;
  num_students?: number;
}

interface ReduxProps {
  action_all_projects_state: string;
  set_compute_image: (image_name: string) => Promise<void>;
  course_project_id: string;
  kucalc: "yes" | undefined;
  project_map: ProjectMap;
}

interface State {
  confirm_stop_all_projects: boolean;
  confirm_start_all_projects: boolean;
}

export const StudentProjectsControlPanel = rclass<ReactProps>(
  class StudentProjectsControlPanel extends Component<
    ReactProps & ReduxProps,
    State
  > {
    displayName: "CourseEditorConfiguration-StudentProjectsControlPanel";

    static reduxProps({ name }) {
      return {
        [name]: {
          action_all_projects_state: rtypes.string,
          course_project_id: rtypes.string
        },
        projects: {
          project_map: rtypes.immutable.Map
        },
        customize: {
          kucalc: rtypes.string
        }
      };
    }

    constructor(props) {
      super(props);
      this.state = {
        confirm_stop_all_projects: false,
        confirm_start_all_projects: false
      };
    }

    shouldComponentUpdate(props, state): boolean {
      return (
        this.props.action_all_projects_state !==
          props.action_all_projects_state ||
        misc.is_different(this.state, state, [
          "confirm_start_all_projects",
          "confirm_stop_all_projects"
        ]) ||
        this.props.project_map
          .get(this.props.course_project_id)
          .get("compute_image") !==
          props.project_map
            .get(this.props.course_project_id)
            .get("compute_image")
      );
    }

    get_actions(): CourseActions {
      return redux.getActions(this.props.name);
    }

    render_in_progress_action() {
      let bsStyle;
      const state_name = this.props.action_all_projects_state;
      switch (state_name) {
        case "stopping":
          if (this.props.num_running_projects === 0) {
            return;
          }
          bsStyle = "warning";
          break;
        default:
          if (this.props.num_running_projects === this.props.num_students) {
            return;
          }
          bsStyle = "info";
      }

      return (
        <Alert bsStyle={bsStyle}>
          {misc.capitalize(state_name)} all projects...{" "}
          <Icon name="cc-icon-cocalc-ring" spin />
        </Alert>
      );
    }

    render_confirm_stop_all_projects() {
      return (
        <Alert bsStyle="warning">
          Are you sure you want to stop all student projects (this might be
          disruptive)?
          <br />
          <br />
          <ButtonToolbar>
            <Button
              bsStyle="warning"
              onClick={() => {
                this.setState({ confirm_stop_all_projects: false });
                return this.get_actions().action_all_student_projects("stop");
              }}
            >
              <Icon name="hand-stop-o" /> Stop all
            </Button>
            <Button
              onClick={() =>
                this.setState({ confirm_stop_all_projects: false })
              }
            >
              Cancel
            </Button>
          </ButtonToolbar>
        </Alert>
      );
    }

    render_confirm_start_all_projects() {
      return (
        <Alert bsStyle="info">
          Are you sure you want to start all student projects? This will ensure
          the projects are already running when the students open them.
          <br />
          <br />
          <ButtonToolbar>
            <Button
              bsStyle="primary"
              onClick={() => {
                this.setState({ confirm_start_all_projects: false });
                return this.get_actions().action_all_student_projects("start");
              }}
            >
              <Icon name="flash" /> Start all
            </Button>
            <Button
              onClick={() =>
                this.setState({ confirm_start_all_projects: false })
              }
            >
              Cancel
            </Button>
          </ButtonToolbar>
        </Alert>
      );
    }

    render_select_compute_image_row() {
      if (this.props.kucalc !== "yes") {
        return;
      }
      const current_image = this.props.project_map
        .get(this.props.course_project_id)
        .get("compute_image");
      return (
        <div>
          <LabeledRow
            key="cpu-usage"
            label="Software Environment"
            style={{
              marginBottom: "5px",
              paddingBottom: "10px",
              borderBottom: "1px solid #ccc"
            }}
          >
            <ComputeImageSelector
              active_compute_image={current_image}
              save_compute_image={this.get_actions().set_compute_image}
            />
          </LabeledRow>
        </div>
      );
    }

    render() {
      const r = this.props.num_running_projects;
      const n = this.props.num_students;
      return (
        <Panel
          header={
            <h4>
              <Icon name="flash" /> Student projects control
            </h4>
          }
        >
          {this.render_select_compute_image_row()}
          <Row>
            <Col md={9}>
              {r} of {n} student projects currently running.
            </Col>
          </Row>
          <Row style={{ marginTop: "10px" }}>
            <Col md={12}>
              <ButtonToolbar>
                <Button
                  onClick={() =>
                    this.setState({ confirm_start_all_projects: true })
                  }
                  disabled={
                    n === 0 ||
                    n === r ||
                    this.state.confirm_start_all_projects ||
                    this.props.action_all_projects_state === "starting"
                  }
                >
                  <Icon name="flash" /> Start all...
                </Button>
                <Button
                  onClick={() =>
                    this.setState({ confirm_stop_all_projects: true })
                  }
                  disabled={
                    n === 0 ||
                    r === 0 ||
                    this.state.confirm_stop_all_projects ||
                    this.props.action_all_projects_state === "stopping"
                  }
                >
                  <Icon name="hand-stop-o" /> Stop all...
                </Button>
              </ButtonToolbar>
            </Col>
          </Row>
          <Row style={{ marginTop: "10px" }}>
            <Col md={12}>
              {this.state.confirm_start_all_projects
                ? this.render_confirm_start_all_projects()
                : undefined}
              {this.state.confirm_stop_all_projects
                ? this.render_confirm_stop_all_projects()
                : undefined}
              {this.props.action_all_projects_state !== "any"
                ? this.render_in_progress_action()
                : undefined}
            </Col>
          </Row>
          <hr />
          <span style={{ color: "#666" }}>
            Start all projects associated with this course so they are
            immediately ready for your students to use. For example, you might
            do this before a computer lab. You can also stop all projects in
            order to ensure that they do not waste resources or are properly
            upgraded when next used by students.
          </span>
        </Panel>
      );
    }
  }
);
