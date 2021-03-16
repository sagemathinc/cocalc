/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// CoCalc libraries
import { webapp_client } from "../../webapp-client";
import { contains_url, days_ago } from "smc-util/misc";
import { debounce } from "lodash";
// React libraries and Components
import {
  React,
  redux,
  Rendered,
  useState,
  useActions,
  useStore,
  useTypedRedux,
} from "../../app-framework";
import { Button, ButtonGroup, Checkbox } from "../../antd-bootstrap";
import { Alert, Card, Row, Col } from "antd";
// CoCalc Components
import {
  DateTimePicker,
  Icon,
  LabeledRow,
  Loading,
  MarkdownInput,
  Space,
  TextInput,
  TimeAgo,
  ErrorDisplay,
} from "../../r_misc";
import { StudentProjectUpgrades } from "./upgrades";
import { CourseActions } from "../actions";
import { ProjectMap } from "../../todo-types";
import { CourseSettingsRecord, CourseStore } from "../store";
import { HelpBox } from "./help-box";

import { DeleteAllStudentProjects } from "./delete-all-student-projects";
import { DeleteAllStudents } from "./delete-all-students";

import { DeleteSharedProjectPanel } from "../shared-project/delete-shared-project";
import { TerminalCommandPanel } from "./terminal-command";

import { Nbgrader } from "./nbgrader";
import { Parallel } from "./parallel";

import { upgrades } from "smc-util/upgrade-spec";
import { StudentProjectsStartStopPanel } from "./start-stop-panel";
import { DisableStudentCollaboratorsPanel } from "./disable-collaborators";
import { StudentProjectSoftwareEnvironment } from "./student-project-software-environment";
import { DatastoreConfig } from "./datastore-config";

const STUDENT_COURSE_PRICE = upgrades.subscription.student_course.price.month4;

interface Props {
  name: string;
  project_id: string;
  settings: CourseSettingsRecord;
  project_map: ProjectMap;
  configuring_projects?: boolean;
}

export const ConfigurationPanel: React.FC<Props> = React.memo(
  ({ name, project_id, settings, project_map, configuring_projects }) => {
    const [show_students_pay, set_show_students_pay] = useState<boolean>(false);
    const [email_body_error, set_email_body_error] = useState<
      string | undefined
    >(undefined);

    const actions = useActions<CourseActions>({ name });
    const store = useStore<CourseStore>({ name });
    const is_commercial = useTypedRedux("customize", "is_commercial");

    /*
     * Editing title/description
     */
    function render_title_desc_header() {
      return (
        <>
          <Icon name="header" /> Title and description
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
          <Icon name="table" /> Export grades
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

    function render_save_grades() {
      return (
        <Card title={render_grades_header()}>
          <div style={{ marginBottom: "10px" }}>Save grades to... </div>
          <ButtonGroup>
            <Button onClick={save_grades_to_csv}>
              <Icon name="file-text-o" /> CSV file...
            </Button>
            <Button onClick={save_grades_to_json}>
              <Icon name="file-code-o" /> JSON file...
            </Button>
            <Button onClick={save_grades_to_py}>
              <Icon name="file-code-o" /> Python file...
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
              <Icon name="envelope" /> Email invitation
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
              <Icon name="envelope" /> Reconfigure all projects
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
              actions.configuration.configure_all_projects(true);
            }}
          >
            {configuring_projects ? (
              <Icon name="cc-icon-cocalc-ring" spin />
            ) : undefined}{" "}
            Reconfigure all projects
          </Button>
        </Card>
      );
    }

    function render_push_missing_handouts_and_assignments(): Rendered {
      return (
        <Card
          title={
            <>
              <Icon name="share-square" /> Copy missing handouts and assignments
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
            <Icon name="share-square" /> Copy missing handouts and assignments
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

    /*
  Students pay
  */
    function get_student_pay_when(): Date | string {
      const date = settings.get("pay");
      if (date) {
        return date;
      } else {
        return days_ago(-7);
      }
    }

    function handle_student_pay_button(): void {
      set_show_students_pay(true);
    }

    function render_students_pay_button() {
      return (
        <Button bsStyle="primary" onClick={handle_student_pay_button}>
          <Icon name="arrow-circle-up" /> Configure how students will pay...
        </Button>
      );
    }

    function render_student_pay_choice_checkbox() {
      return (
        <span>
          <Checkbox
            checked={
              !!(settings != null ? settings.get("student_pay") : undefined)
            }
            onChange={handle_student_pay_choice}
          >
            Students will pay for this course
          </Checkbox>
        </span>
      );
    }

    function handle_student_pay_choice(e): void {
      actions.configuration.set_pay_choice("student", e.target.checked);
      if (e.target.checked) {
        set_show_students_pay(true);
        actions.configuration.set_course_info(get_student_pay_when());
      }
    }

    function render_require_students_pay_desc() {
      const date = new Date(settings.get("pay"));
      if (date > webapp_client.server_time()) {
        return (
          <span>
            <b>
              Your students will see a warning until <TimeAgo date={date} />.
            </b>{" "}
            They will then be required to upgrade for a special discounted
            one-time fee of ${STUDENT_COURSE_PRICE}.
          </span>
        );
      } else {
        return (
          <span>
            <b>
              Your students are required to upgrade their project now to use it.
            </b>{" "}
            If you want to give them more time to upgrade, move the date
            forward.
          </span>
        );
      }
    }

    function render_require_students_pay_when() {
      if (!settings.get("pay")) {
        return <span />;
      }

      return (
        <div style={{ marginBottom: "1em" }}>
          <div style={{ width: "50%", marginLeft: "3em", marginBottom: "1ex" }}>
            <DateTimePicker
              style={{ width: "20em" }}
              placeholder={"Student Pay Deadline"}
              value={
                typeof settings.get("pay") === "string"
                  ? new Date(settings.get("pay"))
                  : settings.get("pay")
              }
              onChange={(date) => {
                actions.configuration.set_course_info(
                  date != null ? date.toISOString() : undefined
                );
              }}
            />
          </div>
          {settings.get("pay") ? render_require_students_pay_desc() : undefined}
        </div>
      );
    }

    function render_students_pay_submit_buttons() {
      return (
        <Button onClick={() => set_show_students_pay(false)}>Close</Button>
      );
    }

    function handle_students_pay_checkbox(e): void {
      if (e.target.checked) {
        actions.configuration.set_course_info(get_student_pay_when());
      } else {
        actions.configuration.set_course_info("");
      }
    }

    function render_students_pay_checkbox_label() {
      if (settings.get("pay")) {
        if (webapp_client.server_time() >= settings.get("pay")) {
          return <span>Require that students upgrade immediately:</span>;
        } else {
          return (
            <span>
              Require that students upgrade by{" "}
              <TimeAgo date={settings.get("pay")} />:{" "}
            </span>
          );
        }
      } else {
        return <span>Require that students upgrade...</span>;
      }
    }

    function render_students_pay_checkbox() {
      return (
        <span>
          <Checkbox
            checked={!!settings.get("pay")}
            onChange={handle_students_pay_checkbox}
          >
            {render_students_pay_checkbox_label()}
          </Checkbox>
        </span>
      );
    }

    function render_students_pay_dialog() {
      return (
        <Alert
          type="warning"
          message={
            <div>
              <h3>
                <Icon name="arrow-circle-up" /> Require students to upgrade
              </h3>
              <hr />
              <span>
                Click the following checkbox to require that all students in the
                course pay a special discounted{" "}
                <b>one-time ${STUDENT_COURSE_PRICE}</b> fee to move their
                project from trial servers to better members-only servers,
                enable full internet access, and not see a large red warning
                message. This lasts four months, and{" "}
                <em>you will not be charged (only students are charged).</em>
              </span>

              {render_students_pay_checkbox()}
              {settings.get("pay")
                ? render_require_students_pay_when()
                : undefined}
              {render_students_pay_submit_buttons()}
            </div>
          }
        />
      );
    }

    function render_student_pay_desc() {
      if (settings.get("pay")) {
        return (
          <span>
            <span style={{ fontSize: "18pt" }}>
              <Icon name="check" />
            </span>{" "}
            <Space />
            {render_require_students_pay_desc()}
          </span>
        );
      } else {
        return (
          <span>
            Require that all students in the course pay a one-time $
            {STUDENT_COURSE_PRICE} fee to move their projects off trial servers
            and enable full internet access, for four months. This is strongly
            recommended, and ensures that your students have a better
            experience, and do not see a large{" "}
            <span style={{ color: "red" }}>RED warning banner</span> all the
            time. Alternatively, you (or your university) can pay for all
            students at one for a significant discount -- see below.
          </span>
        );
      }
    }

    function render_student_pay_details() {
      return (
        <div>
          {show_students_pay
            ? render_students_pay_dialog()
            : render_students_pay_button()}
          <hr />
          <div style={{ color: "#666" }}>{render_student_pay_desc()}</div>
        </div>
      );
    }

    function render_require_students_pay() {
      if (!is_commercial) return;
      let bg, style;
      if (
        (settings != null ? settings.get("student_pay") : undefined) ||
        (settings != null ? settings.get("institute_pay") : undefined)
      ) {
        style = bg = undefined;
      } else {
        style = { fontWeight: "bold" };
        bg = "#fcf8e3";
      }
      return (
        <Card
          style={{ background: bg }}
          title={
            <div style={style}>
              <Icon name="dashboard" /> Require students to upgrade (students
              pay)
            </div>
          }
        >
          {render_student_pay_choice_checkbox()}
          {settings?.get("student_pay") && render_student_pay_details()}
        </Card>
      );
    }

    function render_require_institute_pay() {
      if (!is_commercial) return;
      return (
        <StudentProjectUpgrades
          name={name}
          upgrade_goal={settings?.get("upgrade_goal")}
          institute_pay={settings?.get("institute_pay")}
          student_pay={settings?.get("student_pay")}
          site_license_id={settings?.get("site_license_id")}
          site_license_strategy={settings?.get("site_license_strategy")}
          shared_project_id={settings?.get("shared_project_id")}
          disabled={configuring_projects}
        />
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

    function render_nbgrader() {
      return <Nbgrader name={name} />;
    }

    return (
      <div className="smc-vfill" style={{ overflowY: "scroll" }}>
        <Row>
          <Col md={12} style={{ padding: "15px 15px 15px 0" }}>
            {render_require_students_pay()}
            {is_commercial && <br />}
            {render_require_institute_pay()}
            {is_commercial && <br />}
            {render_save_grades()}
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
            {render_configure_all_projects()}
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
            <br />
            <DatastoreConfig
              actions={actions.configuration}
              datastore={settings.get("datastore")}
            />
          </Col>
        </Row>
      </div>
    );
  }
);
