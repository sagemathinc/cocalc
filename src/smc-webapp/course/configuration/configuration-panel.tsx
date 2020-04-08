//#############################################################################
//
//    CoCalc: Collaborative Calculation in the Cloud
//
//    Copyright (C) 2016, Sagemath Inc.
//
//    This program is free software: you can redistribute it and/or modify
//    it under the terms of the GNU General Public License as published by
//    the Free Software Foundation, either version 3 of the License, or
//    (at your option) any later version.
//
//    This program is distributed in the hope that it will be useful,
//    but WITHOUT ANY WARRANTY; without even the implied warranty of
//    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
//    GNU General Public License for more details.
//
//    You should have received a copy of the GNU General Public License
//    along with this program.  If not, see <http://www.gnu.org/licenses/>.
//
//##############################################################################

// CoCalc libraries
import * as misc from "smc-util/misc";
import { webapp_client } from "../../webapp-client";
import { contains_url } from "smc-util/misc2";
import { debounce } from "lodash";

// React libraries and Components
import {
  React,
  rclass,
  redux,
  rtypes,
  Component,
  AppRedux,
  Rendered,
} from "../../app-framework";
import { Button, ButtonGroup, Checkbox } from "../../antd-bootstrap";

import { Alert, Card, Row, Col, Menu } from "antd";

// CoCalc Components
import {
  DateTimePicker,
  HiddenXS,
  Icon,
  LabeledRow,
  Loading,
  MarkdownInput,
  Space,
  TextInput,
  TimeAgo,
  Tip,
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

import { upgrades } from "smc-util/upgrade-spec";
const STUDENT_COURSE_PRICE = upgrades.subscription.student_course.price.month4;

interface StartStopPanelReactProps {
  name: string;
  num_running_projects: number;
  num_students?: number;
}

interface StartStopPanelReduxProps {
  action_all_projects_state: string;
}

interface StartStopPanelState {
  confirm_stop_all_projects: boolean;
  confirm_start_all_projects: boolean;
}

const StudentProjectsStartStopPanel = rclass<StartStopPanelReactProps>(
  class StudentProjectsStartStopPanel extends Component<
    StartStopPanelReactProps & StartStopPanelReduxProps,
    StartStopPanelState
  > {
    static reduxProps({ name }) {
      return {
        [name]: {
          action_all_projects_state: rtypes.string,
        },
      };
    }

    constructor(props) {
      super(props);
      this.state = {
        confirm_stop_all_projects: false,
        confirm_start_all_projects: false,
      };
    }

    get_actions(): CourseActions {
      const actions = redux.getActions(this.props.name);
      if (actions == null) {
        throw Error("actions must be defined");
      }
      return actions as CourseActions;
    }

    render_in_progress_action() {
      let type;
      const state_name = this.props.action_all_projects_state;
      switch (state_name) {
        case "stopping":
          if (this.props.num_running_projects === 0) {
            return;
          }
          type = "warning";
          break;
        default:
          if (this.props.num_running_projects === this.props.num_students) {
            return;
          }
          type = "info";
      }

      return (
        <Alert
          type={type}
          message={
            <div>
              {misc.capitalize(state_name)} all projects...{" "}
              <Icon name="cc-icon-cocalc-ring" spin />
              <br />
              <Button
                onClick={() =>
                  this.get_actions().student_projects.cancel_action_all_student_projects()
                }
              >
                Cancel
              </Button>
            </div>
          }
        />
      );
    }

    render_confirm_stop_all_projects() {
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
                    this.setState({ confirm_stop_all_projects: false });
                    this.get_actions().student_projects.action_all_student_projects(
                      "stop"
                    );
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
              </ButtonGroup>
            </div>
          }
        />
      );
    }

    render_confirm_start_all_projects() {
      return (
        <Alert
          type="info"
          message={
            <div>
              Are you sure you want to start all student projects? This will
              ensure the projects are already running when the students open
              them.
              <br />
              <br />
              <ButtonGroup>
                <Button
                  bsStyle="primary"
                  onClick={() => {
                    this.setState({ confirm_start_all_projects: false });
                    this.get_actions().student_projects.action_all_student_projects(
                      "start"
                    );
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
              </ButtonGroup>
            </div>
          }
        />
      );
    }

    render() {
      const r = this.props.num_running_projects;
      const n = this.props.num_students;
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
              </ButtonGroup>
            </Col>
          </Row>
          <Row style={{ marginTop: "10px" }}>
            <Col md={24}>
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
        </Card>
      );
    }
  }
);

interface DisableStudentCollaboratorsPanelProps {
  checked: boolean;
  on_change: (checked: boolean) => void;
}

class DisableStudentCollaboratorsPanel extends Component<
  DisableStudentCollaboratorsPanelProps
> {
  shouldComponentUpdate(props) {
    return this.props.checked !== props.checked;
  }

  render() {
    return (
      <Card
        title={
          <>
            <Icon name="envelope" /> Collaborator policy
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
          <Checkbox
            checked={this.props.checked}
            onChange={(e) => this.props.on_change((e.target as any).checked)}
          >
            Allow arbitrary collaborators
          </Checkbox>
        </div>
        <hr />
        <span style={{ color: "#666" }}>
          If this box is checked (this is the default), the owner and any
          collaborator on this student project may add collaborators to this
          project. If this box is not checked, any collaborators on this student
          project will be removed, with the exception of the student,
          instructor, and TAs. Here "instructor and TAs" means any user who is
          an owner or collaborator on the teaching project, i.e. the project
          containing the course file. After "Allow arbitrary collaborators" is
          checked, collaborators to be excluded are removed when opening the
          course file or upon clicking "Reconfigure all projects".
        </span>
      </Card>
    );
  }
}

interface ConfigurationPanelProps {
  redux: AppRedux;
  name: string;
  path: string;
  project_id: string;
  settings: CourseSettingsRecord;
  project_map: ProjectMap;
  configuring_projects?: boolean;
}

interface ConfigurationPanelState {
  show_students_pay_dialog: boolean;
  email_body_error?: string;
  students_pay?: boolean;
}

export class ConfigurationPanel extends Component<
  ConfigurationPanelProps,
  ConfigurationPanelState
> {
  constructor(props) {
    super(props);
    this.state = {
      show_students_pay_dialog: false,
      email_body_error: undefined,
    };
    this.check_email_body = debounce(this.check_email_body.bind(this), 50, {
      leading: true,
      trailing: true,
    });
  }

  shouldComponentUpdate(props, state) {
    return (
      misc.is_different(this.state, state, [
        "show_students_pay_dialog",
        "email_body_error",
      ]) ||
      misc.is_different(this.props, props, [
        "settings",
        "project_map",
        "configuring_projects",
      ])
    );
  }

  get_actions(): CourseActions {
    return redux.getActions(this.props.name);
  }

  get_store(): CourseStore {
    return redux.getStore(this.props.name) as any;
  }

  /*
   * Editing title/description
   */
  render_title_desc_header() {
    return (
      <>
        <Icon name="header" /> Title and description
      </>
    );
  }

  render_title_description() {
    let left;
    if (this.props.settings == null) {
      return <Loading />;
    }
    return (
      <Card title={this.render_title_desc_header()}>
        <LabeledRow label="Title">
          <TextInput
            text={(left = this.props.settings.get("title")) != null ? left : ""}
            on_change={(title) =>
              this.get_actions().configuration.set_title(title)
            }
          />
        </LabeledRow>
        <LabeledRow label="Description">
          <MarkdownInput
            persist_id={this.props.name + "course-description"}
            attach_to={this.props.name}
            rows={6}
            type="textarea"
            default_value={this.props.settings.get("description")}
            on_save={(desc) =>
              this.get_actions().configuration.set_description(desc)
            }
          />
        </LabeledRow>
        <hr />
        <span style={{ color: "#666" }}>
          Set the course title and description here. When you change the title
          or description, the corresponding title and description of each
          student project will be updated. The description is set to this
          description, and the title is set to the student name followed by this
          title. Use the description to provide additional information about the
          course, e.g., a link to the main course website.
        </span>
      </Card>
    );
  }

  /*
   * Grade export
   */
  render_grades_header() {
    return (
      <>
        <Icon name="table" /> Export grades
      </>
    );
  }

  save_grades_to_csv = async () => {
    await this.get_actions().export.to_csv();
  };

  save_grades_to_py = async () => {
    await this.get_actions().export.to_py();
  };

  render_save_grades() {
    return (
      <Card title={this.render_grades_header()}>
        <div style={{ marginBottom: "10px" }}>Save grades to... </div>
        <ButtonGroup>
          <Button onClick={this.save_grades_to_csv}>
            <Icon name="file-text-o" /> CSV file...
          </Button>
          <Button onClick={this.save_grades_to_py}>
            <Icon name="file-code-o" /> Python file...
          </Button>
        </ButtonGroup>
        <hr />
        <div style={{ color: "#666" }}>
          Export all the grades you have recorded for students in your course to
          a csv or Python file.
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

  check_email_body(value) {
    const allow_urls: boolean = redux
      .getStore("projects")
      .allow_urls_in_emails(this.props.project_id);
    if (!allow_urls && contains_url(value)) {
      this.setState({
        email_body_error: "Sending URLs is not allowed. (anti-spam measure)",
      });
    } else {
      this.setState({ email_body_error: undefined });
    }
  }

  render_email_body_error() {
    if (this.state.email_body_error == null) return;
    return <ErrorDisplay error={this.state.email_body_error} />;
  }

  render_email_invite_body() {
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
          {this.render_email_body_error()}
          <MarkdownInput
            persist_id={this.props.name + "email-invite-body"}
            attach_to={this.props.name}
            rows={6}
            type="textarea"
            default_value={this.get_store().get_email_invite()}
            on_save={(body) =>
              this.get_actions().configuration.set_email_invite(body)
            }
            save_disabled={this.state.email_body_error != null}
            on_change={this.check_email_body}
            on_cancel={() => this.setState({ email_body_error: undefined })}
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

  render_configure_all_projects(): Rendered {
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
          disabled={this.props.configuring_projects}
          onClick={() => {
            this.get_actions().configuration.configure_all_projects(true);
          }}
        >
          {this.props.configuring_projects ? (
            <Icon name="cc-icon-cocalc-ring" spin />
          ) : undefined}{" "}
          Reconfigure all projects
        </Button>
      </Card>
    );
  }

  render_push_missing_handouts_and_assignments(): Rendered {
    return (
      <Card
        title={
          <>
            <Icon name="share-square" /> Copy missing handouts and assignments
          </>
        }
      >
        If you <b>add new students</b> to your course, you can click this button
        to ensure they have all the assignments and handouts that you have
        already assigned to other students in the course.
        <hr />
        <Button
          onClick={() => {
            this.get_actions().configuration.push_missing_handouts_and_assignments();
          }}
        >
          <Icon name="share-square" /> Copy missing handouts and assignments
        </Button>
      </Card>
    );
  }

  render_start_all_projects() {
    const r = this.get_store().num_running_projects(this.props.project_map);
    const n = this.get_store().num_students();
    return (
      <StudentProjectsStartStopPanel
        name={this.props.name}
        num_running_projects={r}
        num_students={n}
      />
    );
  }

  /*
  Students pay
  */
  get_student_pay_when() {
    const date = this.props.settings.get("pay");
    if (date) {
      return date;
    } else {
      return misc.days_ago(-7);
    }
  }

  handle_student_pay_button = () => {
    return this.setState({ show_students_pay_dialog: true });
  };

  render_students_pay_button() {
    return (
      <Button bsStyle="primary" onClick={this.handle_student_pay_button}>
        <Icon name="arrow-circle-up" />{" "}
        {this.state.students_pay
          ? "Adjust settings"
          : "Configure how students will pay"}
        ...
      </Button>
    );
  }

  render_student_pay_choice_checkbox() {
    return (
      <span>
        <Checkbox
          checked={
            !!(this.props.settings != null
              ? this.props.settings.get("student_pay")
              : undefined)
          }
          onChange={this.handle_student_pay_choice}
        >
          Students will pay for this course
        </Checkbox>
      </span>
    );
  }

  handle_student_pay_choice = (e) => {
    return this.get_actions().configuration.set_pay_choice(
      "student",
      e.target.checked
    );
  };

  render_require_students_pay_desc() {
    const date = new Date(this.props.settings.get("pay"));
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
          If you want to give them more time to upgrade, move the date forward.
        </span>
      );
    }
  }

  render_require_students_pay_when() {
    let value;
    if (!this.props.settings.get("pay")) {
      return <span />;
    } else if (typeof this.props.settings.get("pay") === "string") {
      value = new Date(this.props.settings.get("pay"));
    }

    return (
      <div style={{ marginBottom: "1em" }}>
        <div style={{ width: "50%", marginLeft: "3em", marginBottom: "1ex" }}>
          <DateTimePicker
            style={{ width: "20em" }}
            placeholder={"Student Pay Deadline"}
            value={value != null ? value : this.props.settings.get("pay")}
            onChange={(date) => {
              this.get_actions().configuration.set_course_info(
                date != null ? date.toISOString() : undefined
              );
            }}
          />
        </div>
        {this.props.settings.get("pay")
          ? this.render_require_students_pay_desc()
          : undefined}
      </div>
    );
  }

  render_students_pay_submit_buttons() {
    return (
      <Button
        onClick={() => this.setState({ show_students_pay_dialog: false })}
      >
        Close
      </Button>
    );
  }

  handle_students_pay_checkbox = (e) => {
    if (e.target.checked) {
      this.get_actions().configuration.set_course_info(
        this.get_student_pay_when()
      );
    } else {
      this.get_actions().configuration.set_course_info("");
    }
  };

  render_students_pay_checkbox_label() {
    if (this.props.settings.get("pay")) {
      if (webapp_client.server_time() >= this.props.settings.get("pay")) {
        return <span>Require that students upgrade immediately:</span>;
      } else {
        return (
          <span>
            Require that students upgrade by{" "}
            <TimeAgo date={this.props.settings.get("pay")} />:{" "}
          </span>
        );
      }
    } else {
      return <span>Require that students upgrade...</span>;
    }
  }

  render_students_pay_checkbox() {
    return (
      <span>
        <Checkbox
          checked={!!this.props.settings.get("pay")}
          onChange={this.handle_students_pay_checkbox}
        >
          {this.render_students_pay_checkbox_label()}
        </Checkbox>
      </span>
    );
  }

  render_students_pay_dialog() {
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
              <b>one-time ${STUDENT_COURSE_PRICE}</b> fee to move their project
              from trial servers to better members-only servers, enable full
              internet access, and not see a large red warning message. This
              lasts four months, and{" "}
              <em>you will not be charged (only students are charged).</em>
            </span>

            {this.render_students_pay_checkbox()}
            {this.props.settings.get("pay")
              ? this.render_require_students_pay_when()
              : undefined}
            {this.render_students_pay_submit_buttons()}
          </div>
        }
      />
    );
  }

  render_student_pay_desc() {
    if (this.props.settings.get("pay")) {
      return (
        <span>
          <span style={{ fontSize: "18pt" }}>
            <Icon name="check" />
          </span>{" "}
          <Space />
          {this.render_require_students_pay_desc()}
        </span>
      );
    } else {
      return (
        <span>
          Require that all students in the course pay a one-time $
          {STUDENT_COURSE_PRICE} fee to move their projects off trial servers
          and enable full internet access, for four months. This is strongly
          recommended, and ensures that your students have a better experience,
          and do not see a large{" "}
          <span style={{ color: "red" }}>RED warning banner</span> all the time.
          Alternatively, you (or your university) can pay for all students at
          one for a significant discount -- see below.
        </span>
      );
    }
  }

  render_student_pay_details() {
    return (
      <div>
        {this.state.show_students_pay_dialog
          ? this.render_students_pay_dialog()
          : this.render_students_pay_button()}
        <hr />
        <div style={{ color: "#666" }}>{this.render_student_pay_desc()}</div>
      </div>
    );
  }

  render_require_students_pay() {
    let bg, style;
    if (
      (this.props.settings != null
        ? this.props.settings.get("student_pay")
        : undefined) ||
      (this.props.settings != null
        ? this.props.settings.get("institute_pay")
        : undefined)
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
            <Icon name="dashboard" /> Require students to upgrade (students pay)
          </div>
        }
      >
        {this.render_student_pay_choice_checkbox()}
        {(
          this.props.settings != null
            ? this.props.settings.get("student_pay")
            : undefined
        )
          ? this.render_student_pay_details()
          : undefined}
      </Card>
    );
  }

  render_require_institute_pay() {
    return (
      <StudentProjectUpgrades
        name={this.props.name}
        redux={this.props.redux}
        upgrade_goal={
          this.props.settings != null
            ? this.props.settings.get("upgrade_goal")
            : undefined
        }
        institute_pay={
          this.props.settings != null
            ? this.props.settings.get("institute_pay")
            : undefined
        }
        student_pay={
          this.props.settings != null
            ? this.props.settings.get("student_pay")
            : undefined
        }
        site_license_id={
          this.props.settings != null
            ? this.props.settings.get("site_license_id")
            : undefined
        }
      />
    );
  }

  render_delete_shared_project() {
    if (this.props.settings.get("shared_project_id")) {
      return (
        <DeleteSharedProjectPanel
          delete={() => this.get_actions().shared_project.delete()}
        />
      );
    }
  }

  render_delete_student_projects() {
    return (
      <DeleteAllStudentProjects
        delete_projects={() =>
          this.get_actions().student_projects.delete_all_student_projects()
        }
      />
    );
  }

  render_delete_all_students() {
    return (
      <DeleteAllStudents
        delete_all_students={() =>
          this.get_actions().students.delete_all_students()
        }
      />
    );
  }

  render_terminal_command() {
    return (
      <TerminalCommandPanel redux={this.props.redux} name={this.props.name} />
    );
  }

  render_disable_students() {
    return (
      <DisableStudentCollaboratorsPanel
        checked={!!this.props.settings.get("allow_collabs")}
        on_change={(val) =>
          this.get_actions().configuration.set_allow_collabs(val)
        }
      />
    );
  }

  scrollToTargetAdjusted = (id) => {
    var element: HTMLElement | null = document.getElementById(id);
    if (!element) {
      console.log("document.getElementById(id) returned null");
      return;
    }
    element.scrollIntoView(true);
    //document.getElementById("configurationpagecontainer")!.scrollTop;
  };

  toggleCollapsed = () => {
    this.setState({ collapsed: !this.state.collapsed });
  };

  render() {
    if (window.innerWidth > 700) {
      // LARGER SCREENS
      return (
        <div
          className="smc-vfill"
          style={{
            flexDirection: "row",
          }}
        >
          <div
            className="smc-vfill"
            style={{
              overflowX: "hidden",
              overflowY: "auto",
              flex: "2",
              paddingLeft: "10px",
              minWidth: "260px",
            }}
          >
            <h1
              style={{
                fontSize: "20px",
              }}
            >
              <Icon name="wrench" /> Configuration Settings
            </h1>
            <Menu
              mode="inline"
              onClick={(e) => {
                this.scrollToTargetAdjusted(e.key);
              }}
              inlineCollapsed={this.state.collapsed}
            >
              <Menu.Item key="item1">
                <Icon name="header" />
                <span> Title and Description</span>
              </Menu.Item>
              <Menu.Item key="item2">
                <Icon name="envelope" />
                <span> Email Invitation</span>
              </Menu.Item>
              <Menu.Item key="item3">
                <Icon name="envelope" />
                <span> Colaborator Policy</span>
              </Menu.Item>
              <Menu.Item key="item4">
                <Icon name="bolt" />
                <span> Start/Stop Projects</span>
              </Menu.Item>
              <Menu.Item key="item5">
                <Icon name="terminal" />
                <span> Projects Terminal</span>
              </Menu.Item>
              <Menu.Item key="item6">
                <Icon name="trash" />
                <span> Delete Projects/Students</span>
              </Menu.Item>
              {this.props.settings.get("shared_project_id") ? (
                <Menu.Item key="item7">
                  <Icon name="trash" />
                  <span> Delete Shared projects</span>
                </Menu.Item>
              ) : undefined}
              <Menu.Item key="item8">
                <Icon name="share-square" />
                <span> Copy Assiangments</span>
              </Menu.Item>
              <Menu.Item key="item9">
                <Icon name="dashboard" />
                <span> Upgrade Settings</span>
              </Menu.Item>
              <Menu.Item key="item10">
                <Icon name="table" />
                <span> Export Grades</span>
              </Menu.Item>
              <Menu.Item key="item11">
                <Icon name="envelope" />
                <span> Project Configuration</span>
              </Menu.Item>
              <Menu.Item key="item12">
                <Icon name="exclamation-circle" />
                <span> Help</span>
              </Menu.Item>
            </Menu>
            <div style={{ overflow: "auto" }}></div>
          </div>
          <div
            className="smc-vfill"
            //id="configurationpagecontainer"
            style={{ overflow: "auto", flex: "13" }}
          >
            <div style={{ padding: "15px", maxWidth: "1000px" }}>
              <div id="item1"></div>
              {this.render_title_description()}
              <br />
              <div id="item2"></div>
              {this.render_email_invite_body()}
              <br />
              <div id="item3"></div>
              {this.render_disable_students()}
              <br />
              <div id="item4"></div>
              {this.render_start_all_projects()}
              <br />
              <div id="item5"></div>
              {this.render_terminal_command()}
              <br />
              <div id="item6"></div>
              {this.render_delete_student_projects()}
              <br />
              {this.render_delete_all_students()}
              <br />
              <div id="item7"></div>
              {this.render_delete_shared_project()}
              <div id="item8"></div>
              {this.render_push_missing_handouts_and_assignments()}
              <br />
              <div id="item9"></div>
              {this.render_require_students_pay()}
              <br />
              {this.render_require_institute_pay()}
              <br />
              <div id="item10"></div>
              {this.render_save_grades()}
              <br />
              <div id="item11"></div>
              {this.render_configure_all_projects()}
              <br />
              <div id="item12"></div>
              <HelpBox />
              <div style={{ height: "700px" }}></div>
            </div>
          </div>
        </div>
      );
    } else {
      //  SIMPLE MOBILE LAYOUT. single column of settings panels
      return (
        <div className="smc-vfill" style={{}}>
          <div
            className="smc-vfill"
            //id="configurationpagecontainer"
            style={{ alignItems: "Center", overflow: "auto" }}
          >
            <div style={{ }}>
              <div id="item1"></div>
              {this.render_title_description()}
              <br />
              <div id="item2"></div>
              {this.render_email_invite_body()}
              <br />
              <div id="item3"></div>
              {this.render_disable_students()}
              <br />
              <div id="item4"></div>
              {this.render_start_all_projects()}
              <br />
              <div id="item5"></div>
              {this.render_terminal_command()}
              <br />
              <div id="item6"></div>
              {this.render_delete_student_projects()}
              <br />
              {this.render_delete_all_students()}
              <br />
              <div id="item7"></div>
              {this.render_delete_shared_project()}
              <div id="item8"></div>
              {this.render_push_missing_handouts_and_assignments()}
              <br />
              <div id="item9"></div>
              {this.render_require_students_pay()}
              <br />
              {this.render_require_institute_pay()}
              <br />
              <div id="item10"></div>
              {this.render_save_grades()}
              <br />
              <div id="item11"></div>
              {this.render_configure_all_projects()}
              <br />
              <div id="item12"></div>
              <HelpBox />
            </div>
          </div>
        </div>
      );
    }
  }
}

export function ConfigurationPanelHeader() {
  return (
    <Tip
      delayShow={1300}
      title="Configuration"
      tip="Configure various things about your course here, including the title and description.  You can also export all grades in various formats from this page."
    >
      <span>
        <Icon name="cogs" /> <HiddenXS>Configuration</HiddenXS>
      </span>
    </Tip>
  );
}
