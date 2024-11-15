import { Alert, Button, Card, Col, Popconfirm, Row, Space, Spin } from "antd";
import { FormattedMessage, useIntl } from "react-intl";

import { useActions, useRedux } from "@cocalc/frontend/app-framework";
import { Paragraph } from "@cocalc/frontend/components";
import { Icon } from "@cocalc/frontend/components/icon";
import { labels } from "@cocalc/frontend/i18n";
import { capitalize } from "@cocalc/util/misc";
import type { CourseActions } from "../actions";

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
  const intl = useIntl();
  const action_all_projects_state: string = useRedux([
    name,
    "action_all_projects_state",
  ]);
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
              {intl.formatMessage(labels.cancel)}
            </Button>
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
          <Icon name="bolt" />{" "}
          <FormattedMessage
            id="course.start-stop-panel.title"
            defaultMessage="Start or Stop all Student Projects"
          />
        </>
      }
    >
      <Row>
        <Col md={18}>
          <FormattedMessage
            id="course.start-stop-panel.status"
            defaultMessage={`{r} of {n} student projects currently running.`}
            values={{ r, n }}
          />
        </Col>
      </Row>
      <Row style={{ marginTop: "10px" }}>
        <Col md={24}>
          <Space>
            <Popconfirm
              title={
                <div style={{ maxWidth: "400px" }}>
                  <FormattedMessage
                    id="course.start-stop-panel.confirm"
                    defaultMessage={`<b>Are you sure you want to start all student projects?</b>
                    {br}
                    This will ensure the projects are already running when the students open them,
                    and can make assigning and collecting homework more robust.`}
                    values={{ br: <br /> }}
                  />
                </div>
              }
              onConfirm={() => {
                actions.student_projects.action_all_student_projects("start");
              }}
            >
              <Button
                disabled={
                  n === 0 || n === r || action_all_projects_state === "starting"
                }
              >
                <Icon name="bolt" />{" "}
                <FormattedMessage
                  id="course.start-stop-panel.start-all.button"
                  defaultMessage="Start all..."
                />
              </Button>
            </Popconfirm>
            <Popconfirm
              title={
                <div style={{ maxWidth: "400px" }}>
                  <FormattedMessage
                    id="course.start-stop-panel.stop-all.confirm"
                    defaultMessage="Are you sure you want to stop all student projects (this might be disruptive)?"
                  />
                </div>
              }
              onConfirm={() => {
                actions.student_projects.action_all_student_projects("stop");
              }}
            >
              <Button
                disabled={
                  n === 0 || r === 0 || action_all_projects_state === "stopping"
                }
              >
                <Icon name="PoweroffOutlined" />{" "}
                <FormattedMessage
                  id="course.start-stop-panel.stop-all.button"
                  defaultMessage="Stop all..."
                />
              </Button>
            </Popconfirm>
          </Space>
        </Col>
      </Row>
      <Row style={{ marginTop: "10px" }}>
        <Col md={24}>
          {action_all_projects_state !== "any" && render_in_progress_action()}
        </Col>
      </Row>
      <hr />
      <Paragraph type="secondary">
        <FormattedMessage
          id="course.start-stop-panel.info"
          defaultMessage={`Start all projects associated with this course,
            so they are immediately ready for your students to use.
            For example, you might do this before a computer lab.
            You can also stop all projects in order to ensure
            that they do not waste resources or are properly upgraded when next used by students.`}
        />
      </Paragraph>
    </Card>
  );
}
