/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { debounce } from "lodash";
import { Card, Row, Col } from "antd";

// React libraries and Components
import {
  React,
  redux,
  Rendered,
  useState,
  useActions,
  useStore,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { Button, ButtonGroup } from "@cocalc/frontend/antd-bootstrap";
import { contains_url, plural } from "@cocalc/util/misc";
import {
  Icon,
  LabeledRow,
  Loading,
  MarkdownInput,
  TextInput,
  ErrorDisplay,
} from "@cocalc/frontend/components";
import { StudentProjectUpgrades } from "./upgrades";
import { CourseActions } from "../actions";
import { ProjectMap } from "@cocalc/frontend/todo-types";
import { CourseSettingsRecord, CourseStore } from "../store";
import { HelpBox } from "./help-box";
import { DeleteAllStudentProjects } from "./delete-all-student-projects";
import { DeleteAllStudents } from "./delete-all-students";
import { DeleteSharedProjectPanel } from "../shared-project/delete-shared-project";
import { TerminalCommandPanel } from "./terminal-command";
import { Nbgrader } from "./nbgrader";
import { Parallel } from "./parallel";
import { StudentProjectsStartStopPanel } from "./start-stop-panel";
import { DisableStudentCollaboratorsPanel } from "./disable-collaborators";
import { CustomizeStudentProjectFunctionality } from "./customize-student-project-functionality";
import { StudentProjectSoftwareEnvironment } from "./student-project-software-environment";
import { DatastoreConfig } from "./datastore-config";
import EmptyTrash from "./empty-trash";
import { KUCALC_ON_PREMISES } from "@cocalc/util/db-schema/site-defaults";
import { EnvironmentVariablesConfig } from "./envvars-config";
import { RESEND_INVITE_INTERVAL_DAYS } from "@cocalc/util/consts/invites";
import StudentPay from "./student-pay";

interface Props {
  name: string;
  project_id: string;
  settings: CourseSettingsRecord;
  project_map: ProjectMap;
  configuring_projects?: boolean;
  reinviting_students?: boolean;
}

export const ConfigurationPanel: React.FC<Props> = React.memo(
  ({
    name,
    project_id,
    settings,
    project_map,
    configuring_projects,
    reinviting_students,
  }) => {
    const [email_body_error, set_email_body_error] = useState<
      string | undefined
    >(undefined);

    const actions = useActions<CourseActions>({ name });
    const store = useStore<CourseStore>({ name });
    const is_commercial = useTypedRedux("customize", "is_commercial");
    const kucalc = useTypedRedux("customize", "kucalc");

    /*
     * Editing title/description
     */
    function render_title_desc_header() {
      return (
        <>
          <Icon name="header" /> Title and Description
        </>
      );
    }

    function render_title_description() {
      if (settings == null) {
        return <Loading />;
      }
      return (
        <Card title={render_title_desc_header()}>
          <LabeledRow label="Title">
            <TextInput
              text={settings.get("title") ?? ""}
              on_change={(title) => actions.configuration.set_title(title)}
            />
          </LabeledRow>
          <LabeledRow label="Description">
            <MarkdownInput
              persist_id={name + "course-description"}
              attach_to={name}
              rows={6}
              default_value={settings.get("description")}
              on_save={(desc) => actions.configuration.set_description(desc)}
            />
          </LabeledRow>
          <hr />
          <span style={{ color: "#666" }}>
            Set the course title and description here. When you change the title
            or description, the corresponding title and description of each
            student project will be updated. The description is set to this
            description, and the title is set to the student name followed by
            this title. Use the description to provide additional information
            about the course, e.g., a link to the main course website.
          </span>
        </Card>
      );
    }

    /*
     * Grade export
     */
    function render_grades_header() {
      return (
        <>
          <Icon name="table" /> Export Grades
        </>
      );
    }

    async function save_grades_to_csv() {
      await actions.export.to_csv();
    }

    async function save_grades_to_py() {
      await actions.export.to_py();
    }

    async function save_grades_to_json() {
      await actions.export.to_json();
    }

    function render_export_grades() {
      return (
        <Card title={render_grades_header()}>
          <div style={{ marginBottom: "10px" }}>Save grades to... </div>
          <ButtonGroup>
            <Button onClick={save_grades_to_csv}>
              <Icon name="csv" /> CSV file...
            </Button>
            <Button onClick={save_grades_to_json}>
              <Icon name="file-code" /> JSON file...
            </Button>
            <Button onClick={save_grades_to_py}>
              <Icon name="file-code" /> Python file...
            </Button>
          </ButtonGroup>
          <hr />
          <div style={{ color: "#666" }}>
            Export all the grades you have recorded for students in your course
            to a csv or Python file.
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

    /*
     * Custom invitation email body
     */

    const check_email_body = debounce(
      (value) => {
        const allow_urls: boolean = redux
          .getStore("projects")
          .allow_urls_in_emails(project_id);
        if (!allow_urls && contains_url(value)) {
          set_email_body_error(
            "URLs in emails are not allowed for free trial projects.  Please upgrade or delete the URL. This is an anti-spam measure."
          );
        } else {
          set_email_body_error(undefined);
        }
      },
      500,
      { leading: true, trailing: true }
    );

    function render_email_body_error() {
      if (email_body_error == null) return;
      return <ErrorDisplay error={email_body_error} />;
    }

    function render_email_invite_body() {
      const template_instr =
        " Also, {title} will be replaced by the title of the course and {name} by your name.";
      return (
        <Card
          title={
            <>
              <Icon name="envelope" /> Email Invitation
            </>
          }
        >
          <div
            style={{
              border: "1px solid lightgrey",
              padding: "10px",
              borderRadius: "5px",
            }}
          >
            {render_email_body_error()}
            <MarkdownInput
              persist_id={name + "email-invite-body"}
              attach_to={name}
              rows={6}
              default_value={store.get_email_invite()}
              on_save={(body) => actions.configuration.set_email_invite(body)}
              save_disabled={email_body_error != null}
              on_change={check_email_body}
              on_cancel={() => set_email_body_error(undefined)}
            />
          </div>
          <hr />
          <span style={{ color: "#666" }}>
            If you add a student to this course using their email address, and
            they do not have a CoCalc account, then they will receive this email
            invitation. {template_instr}
          </span>
        </Card>
      );
    }

    function render_configure_all_projects(): Rendered {
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
            {configuring_projects ? (
              <Icon name="cocalc-ring" spin />
            ) : undefined}{" "}
            Reconfigure all Projects
          </Button>
        </Card>
      );
    }

    function render_resend_outstanding_email_invites(): Rendered {
      return (
        <Card
          title={
            <>
              <Icon name="envelope" /> Resend Outstanding Email Invites
            </>
          }
        >
          Send another email to every student who didn't sign up yet. This sends
          a maximum of one email every {RESEND_INVITE_INTERVAL_DAYS}{" "}
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

    function render_push_missing_handouts_and_assignments(): Rendered {
      return (
        <Card
          title={
            <>
              <Icon name="share-square" /> Copy Missing Handouts and Assignments
            </>
          }
        >
          If you <b>add new students</b> to your course, you can click this
          button to ensure they have all the assignments and handouts that you
          have already assigned to other students in the course.
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

    function render_start_all_projects() {
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

    function render_require_institute_pay() {
      if (!is_commercial) return;
      return (
        <>
          <StudentProjectUpgrades
            name={name}
            is_onprem={false}
            is_commercial={is_commercial}
            upgrade_goal={settings?.get("upgrade_goal")}
            institute_pay={settings?.get("institute_pay")}
            student_pay={settings?.get("student_pay")}
            site_license_id={settings?.get("site_license_id")}
            site_license_strategy={settings?.get("site_license_strategy")}
            shared_project_id={settings?.get("shared_project_id")}
            disabled={configuring_projects}
            settings={settings}
            actions={actions.configuration}
          />
          <br />
        </>
      );
    }

    /**
     * OnPrem instances support licenses to be distributed to all student projects.
     */
    function render_onprem_upgrade_projects(): React.ReactNode {
      if (is_commercial || kucalc !== KUCALC_ON_PREMISES) return;
      return (
        <>
          <StudentProjectUpgrades
            name={name}
            is_onprem={true}
            is_commercial={false}
            site_license_id={settings?.get("site_license_id")}
            site_license_strategy={settings?.get("site_license_strategy")}
            shared_project_id={settings?.get("shared_project_id")}
            disabled={configuring_projects}
            settings={settings}
            actions={actions.configuration}
          />
          <br />
        </>
      );
    }

    function render_delete_shared_project() {
      if (settings.get("shared_project_id")) {
        return (
          <DeleteSharedProjectPanel
            delete={() => actions.shared_project.delete()}
          />
        );
      }
    }

    function render_delete_student_projects() {
      return (
        <DeleteAllStudentProjects
          delete_projects={() =>
            actions.student_projects.delete_all_student_projects()
          }
        />
      );
    }

    function render_delete_all_students() {
      return (
        <DeleteAllStudents
          delete_all_students={() => actions.students.delete_all_students()}
        />
      );
    }

    function render_terminal_command() {
      return <TerminalCommandPanel name={name} />;
    }

    function render_disable_students() {
      return (
        <DisableStudentCollaboratorsPanel
          checked={!!settings.get("allow_collabs")}
          on_change={(val) => actions.configuration.set_allow_collabs(val)}
        />
      );
    }

    function render_student_project_functionality() {
      const functionality =
        settings.get("student_project_functionality")?.toJS() ?? {};
      return (
        <CustomizeStudentProjectFunctionality
          functionality={functionality}
          onChange={async (opts) =>
            await actions.configuration.set_student_project_functionality(opts)
          }
        />
      );
    }

    function render_nbgrader() {
      return <Nbgrader name={name} />;
    }

    return (
      <div className="smc-vfill" style={{ overflowY: "scroll" }}>
        <Row>
          <Col md={12} style={{ padding: "15px 15px 15px 0" }}>
            {is_commercial && <StudentPay actions={actions} settings={settings} />}
            {render_require_institute_pay()}
            {render_onprem_upgrade_projects()}
            {render_export_grades()}
            <br />
            {render_start_all_projects()}
            <br />
            {render_terminal_command()}
            <br />
            {render_delete_student_projects()}
            <br />
            {render_delete_all_students()}
            <br />
            {render_delete_shared_project()}
            <br />
            {render_nbgrader()}
          </Col>
          <Col md={12} style={{ padding: "15px" }}>
            <HelpBox />
            <br />
            {render_title_description()}
            <br />
            {render_email_invite_body()}
            <br />
            {render_disable_students()}
            <br />
            {render_student_project_functionality()}
            <br />
            {render_configure_all_projects()}
            <br />
            {render_resend_outstanding_email_invites()}
            <br />
            {render_push_missing_handouts_and_assignments()}
            <br />
            <StudentProjectSoftwareEnvironment
              actions={actions.configuration}
              software_image={settings.get("custom_image")}
              course_project_id={project_id}
              inherit_compute_image={settings.get("inherit_compute_image")}
            />
            <br />
            <Parallel name={name} />
            <DatastoreConfig
              actions={actions.configuration}
              datastore={settings.get("datastore")}
            />
            <br />
            <EnvironmentVariablesConfig
              actions={actions.configuration}
              envvars={settings.get("envvars")}
            />
            <br />
            <EmptyTrash />
          </Col>
        </Row>
      </div>
    );
  }
);
