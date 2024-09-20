/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Button, Card, Row, Col, Space } from "antd";
// React libraries and Components
import { React, useActions, useStore } from "@cocalc/frontend/app-framework";
import { plural } from "@cocalc/util/misc";
import { Icon } from "@cocalc/frontend/components";
import { CourseActions } from "../actions";
import type { ProjectMap } from "@cocalc/frontend/todo-types";
import { CourseStore } from "../store";
import { DeleteAllStudentProjects } from "./delete-all-student-projects";
import { DeleteAllStudents } from "./delete-all-students";
import { TerminalCommandPanel } from "./terminal-command";
import { StudentProjectsStartStopPanel } from "./start-stop-panel";
import EmptyTrash from "./empty-trash";
import { RESEND_INVITE_INTERVAL_DAYS } from "@cocalc/util/consts/invites";

interface Props {
  name: string;
  project_map: ProjectMap;
  configuring_projects?: boolean;
  reinviting_students?: boolean;
}

export const ActionsPanel: React.FC<Props> = React.memo(
  ({ name, project_map, configuring_projects, reinviting_students }) => {
    const actions = useActions<CourseActions>({ name });

    return (
      <div className="smc-vfill" style={{ overflowY: "scroll" }}>
        <Row>
          <Col md={12} style={{ padding: "15px 15px 15px 0" }}>
            <StartAllProjects name={name} project_map={project_map} />
            <br />
            <ReconfigureAllProjects
              configuring_projects={configuring_projects}
              actions={actions}
            />
            <br />
            <TerminalCommandPanel name={name} />
            <br />
            <ExportGrades actions={actions} />
          </Col>
          <Col md={12} style={{ padding: "15px" }}>
            <ResendInvites
              actions={actions}
              reinviting_students={reinviting_students}
            />
            <br />
            <CopyMissingHandoutsAndAssignments actions={actions} />
            <br />
            <EmptyTrash />
            <br />
            <DeleteAllStudentProjects actions={actions} />
            <br />
            <DeleteAllStudents actions={actions} />
          </Col>
        </Row>
      </div>
    );
  },
);

export function StartAllProjects({ name, project_map }) {
  const store = useStore<CourseStore>({ name });
  const r = store.num_running_projects(project_map);
  const n = store.num_students();
  return (
    <StudentProjectsStartStopPanel
      name={name}
      num_running_projects={r}
      num_students={n}
    />
  );
}

export function ExportGrades({ actions, close }: { actions; close? }) {
  async function save_grades_to_csv() {
    await actions.export.to_csv();
    close?.();
  }

  async function save_grades_to_py() {
    await actions.export.to_py();
    close?.();
  }

  async function save_grades_to_json() {
    await actions.export.to_json();
    close?.();
  }

  return (
    <Card
      title={
        <>
          <Icon name="table" /> Export Grades
        </>
      }
    >
      <div style={{ marginBottom: "10px" }}>Save grades to... </div>
      <Space>
        <Button onClick={save_grades_to_csv}>
          <Icon name="csv" /> CSV file...
        </Button>
        <Button onClick={save_grades_to_json}>
          <Icon name="file-code" /> JSON file...
        </Button>
        <Button onClick={save_grades_to_py}>
          <Icon name="file-code" /> Python file...
        </Button>
      </Space>
      <hr />
      <div style={{ color: "#666" }}>
        Export all the grades you have recorded for students in your course to a
        csv or Python file.
        <br />
        In Microsoft Excel, you can{" "}
        <a
          target="_blank"
          href="https://support.office.com/en-us/article/Import-or-export-text-txt-or-csv-files-5250ac4c-663c-47ce-937b-339e391393ba"
        >
          import the CSV file
        </a>
        .
      </div>
    </Card>
  );
}

export function ReconfigureAllProjects({
  actions,
  configuring_projects,
}: {
  actions;
  configuring_projects?: boolean;
}) {
  return (
    <Card
      title={
        <>
          <Icon name="envelope" /> Reconfigure all Projects
        </>
      }
    >
      Ensure all projects have the correct students and TA's, titles and
      descriptions set, etc. This will also resend any outstanding email
      invitations.
      <hr />
      <Button
        disabled={configuring_projects}
        onClick={() => {
          actions.configuration.configure_all_projects();
        }}
      >
        {configuring_projects ? <Icon name="cocalc-ring" spin /> : undefined}{" "}
        Reconfigure all Projects
      </Button>
    </Card>
  );
}

export function ResendInvites({
  actions,
  reinviting_students,
}: {
  actions;
  reinviting_students?;
}) {
  return (
    <Card
      title={
        <>
          <Icon name="envelope" /> Resend Outstanding Email Invites
        </>
      }
    >
      Send another email to every student who didn't sign up yet. This sends a
      maximum of one email every {RESEND_INVITE_INTERVAL_DAYS}{" "}
      {plural(RESEND_INVITE_INTERVAL_DAYS, "day")}.
      <hr />
      <Button
        disabled={reinviting_students}
        onClick={() => {
          actions.student_projects.reinvite_oustanding_students();
        }}
      >
        {reinviting_students ? <Icon name="cocalc-ring" spin /> : undefined}{" "}
        Reinvite students
      </Button>
    </Card>
  );
}

export function CopyMissingHandoutsAndAssignments({ actions }) {
  return (
    <Card
      title={
        <>
          <Icon name="share-square" /> Copy Missing Handouts and Assignments
        </>
      }
    >
      If you <b>add new students</b> to your course, you can click this button
      to ensure they have all the assignments and handouts that you have already
      assigned to other students in the course.
      <hr />
      <Button
        onClick={() => {
          actions.configuration.push_missing_handouts_and_assignments();
        }}
      >
        <Icon name="share-square" /> Copy Missing Handouts and Assignments
      </Button>
    </Card>
  );
}
