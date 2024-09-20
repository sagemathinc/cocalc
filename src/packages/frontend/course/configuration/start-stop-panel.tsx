import { Alert, Button, Card, Row, Col, Space, Spin } from "antd";
import { Icon } from "../../components";
import { useState, useActions, useRedux } from "../../app-framework";
import { CourseActions } from "../actions";
import { capitalize } from "@cocalc/util/misc";

interface Props {
  name: string;
  num_running_projects: number;
  num_students?: number;
}

export function StudentProjectsStartStopPanel({
  name,
  num_running_projects,
  num_students,
}: Props) {
  const action_all_projects_state: string = useRedux([
    name,
    "action_all_projects_state",
  ]);
  const [confirm_stop_all_projects, set_confirm_stop_all_projects] =
    useState<boolean>(false);
  const [confirm_start_all_projects, set_confirm_start_all_projects] =
    useState<boolean>(false);

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
            {capitalize(state_name)} all projects... <Spin />
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
            <Space>
              <Button onClick={() => set_confirm_stop_all_projects(false)}>
                Cancel
              </Button>
              <Button
                danger
                type="primary"
                onClick={() => {
                  set_confirm_stop_all_projects(false);
                  actions.student_projects.action_all_student_projects("stop");
                }}
              >
                <Icon name="PoweroffOutlined" /> Stop all
              </Button>
            </Space>
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
            <Space>
              <Button onClick={() => set_confirm_start_all_projects(false)}>
                Cancel
              </Button>{" "}
              <Button
                type="primary"
                onClick={() => {
                  set_confirm_start_all_projects(false);
                  actions.student_projects.action_all_student_projects("start");
                }}
              >
                <Icon name="bolt" /> Start all
              </Button>
            </Space>
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
          <Icon name="bolt" /> Start or Stop all Student Projects
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
          <Space>
            <Button
              onClick={() => set_confirm_start_all_projects(true)}
              disabled={
                n === 0 ||
                n === r ||
                confirm_start_all_projects ||
                action_all_projects_state === "starting"
              }
            >
              <Icon name="bolt" /> Start all...
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
              <Icon name="PoweroffOutlined" /> Stop all...
            </Button>
          </Space>
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
}
