import { Alert, Card, Row, Col } from "antd";
import { Button, ButtonGroup } from "../../antd-bootstrap";
import { Icon } from "../../r_misc";
import { React, useState, useActions, useRedux } from "../../app-framework";
import { CourseActions } from "../actions";
import { capitalize } from "smc-util/misc";

interface Props {
  name: string;
  num_running_projects: number;
  num_students?: number;
}

export const StudentProjectsStartStopPanel: React.FC<Props> = ({
  name,
  num_running_projects,
  num_students,
}) => {
  const action_all_projects_state: string = useRedux([
    name,
    "action_all_projects_state",
  ]);
  const [confirm_stop_all_projects, set_confirm_stop_all_projects] = useState<
    boolean
  >(false);
  const [confirm_start_all_projects, set_confirm_start_all_projects] = useState<
    boolean
  >(false);

  const actions: CourseActions = useActions(name);

  function render_in_progress_action() {
    let type;
    const state_name = action_all_projects_state;
    switch (state_name) {
      case "stopping":
        if (num_running_projects === 0) {
          return;
        }
        type = "warning";
        break;
      default:
        if (num_running_projects === num_students) {
          return;
        }
        type = "info";
    }

    return (
      <Alert
        type={type}
        message={
          <div>
            {capitalize(state_name)} all projects...{" "}
            <Icon name="cc-icon-cocalc-ring" spin />
            <br />
            <Button
              onClick={() =>
                actions.student_projects.cancel_action_all_student_projects()
              }
            >
              Cancel
            </Button>
          </div>
        }
      />
    );
  }

  function render_confirm_stop_all_projects() {
    return (
      <Alert
        type="warning"
        message={
          <div>
            Are you sure you want to stop all student projects (this might be
            disruptive)?
            <br />
            <br />
            <ButtonGroup>
              <Button
                bsStyle="warning"
                onClick={() => {
                  set_confirm_stop_all_projects(false);
                  actions.student_projects.action_all_student_projects("stop");
                }}
              >
                <Icon name="hand-stop-o" /> Stop all
              </Button>
              <Button onClick={() => set_confirm_stop_all_projects(false)}>
                Cancel
              </Button>
            </ButtonGroup>
          </div>
        }
      />
    );
  }

  function render_confirm_start_all_projects() {
    return (
      <Alert
        type="info"
        message={
          <div>
            Are you sure you want to start all student projects? This will
            ensure the projects are already running when the students open them.
            <br />
            <br />
            <ButtonGroup>
              <Button
                bsStyle="primary"
                onClick={() => {
                  set_confirm_start_all_projects(false);
                  actions.student_projects.action_all_student_projects("start");
                }}
              >
                <Icon name="flash" /> Start all
              </Button>
              <Button onClick={() => set_confirm_start_all_projects(false)}>
                Cancel
              </Button>
            </ButtonGroup>
          </div>
        }
      />
    );
  }

  const r = num_running_projects;
  const n = num_students;
  return (
    <Card
      title={
        <>
          <Icon name="flash" /> Start or stop all student projects
        </>
      }
    >
      <Row>
        <Col md={18}>
          {r} of {n} student projects currently running.
        </Col>
      </Row>
      <Row style={{ marginTop: "10px" }}>
        <Col md={24}>
          <ButtonGroup>
            <Button
              onClick={() => set_confirm_start_all_projects(true)}
              disabled={
                n === 0 ||
                n === r ||
                confirm_start_all_projects ||
                action_all_projects_state === "starting"
              }
            >
              <Icon name="flash" /> Start all...
            </Button>
            <Button
              onClick={() => set_confirm_stop_all_projects(true)}
              disabled={
                n === 0 ||
                r === 0 ||
                confirm_stop_all_projects ||
                action_all_projects_state === "stopping"
              }
            >
              <Icon name="hand-stop-o" /> Stop all...
            </Button>
          </ButtonGroup>
        </Col>
      </Row>
      <Row style={{ marginTop: "10px" }}>
        <Col md={24}>
          {confirm_start_all_projects && render_confirm_start_all_projects()}
          {confirm_stop_all_projects && render_confirm_stop_all_projects()}
          {action_all_projects_state !== "any" && render_in_progress_action()}
        </Col>
      </Row>
      <hr />
      <span style={{ color: "#666" }}>
        Start all projects associated with this course so they are immediately
        ready for your students to use. For example, you might do this before a
        computer lab. You can also stop all projects in order to ensure that
        they do not waste resources or are properly upgraded when next used by
        students.
      </span>
    </Card>
  );
};
