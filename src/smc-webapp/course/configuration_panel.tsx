/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS104: Avoid inline assignments
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
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
const misc = require("smc-util/misc");
const { webapp_client } = require("../webapp_client");
import { contains_url } from "smc-util/misc2";
import { debounce } from "lodash";

// React libraries and Components
import {
  React,
  rclass,
  rtypes,
  Component,
  AppRedux,
  Rendered
} from "../app-framework";
const {
  Alert,
  Button,
  ButtonToolbar,
  Row,
  Col,
  Panel,
  Checkbox,
  Grid
} = require("react-bootstrap");

// CoCalc Components
const {
  Calendar,
  HiddenXS,
  Icon,
  LabeledRow,
  Loading,
  MarkdownInput,
  Space,
  TextInput,
  TimeAgo,
  Tip,
  ErrorDisplay
} = require("../r_misc");

import { StudentProjectUpgrades } from "./upgrades";
import { CourseActions } from "./actions";
import { redux } from "../frame-editors/generic/test/util";
import { ProjectMap } from "../todo-types";
import { CourseSettingsRecord, CourseStore } from "./store";
const { HelpBox } = require("./help_box");
const { DeleteStudentsPanel } = require("./delete_students");
const { DeleteSharedProjectPanel } = require("./delete_shared_project");
const { TerminalCommandPanel } = require("./terminal-command");

const STUDENT_COURSE_PRICE = require("smc-util/upgrade-spec").upgrades
  .subscription.student_course.price.month4;

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
    displayName: "CourseEditorConfiguration-StudentProjectsStartStopPanel";

    static reduxProps({ name }) {
      return {
        [name]: {
          action_all_projects_state: rtypes.string
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

    get_actions(): CourseActions {
      const actions = redux.getActions(this.props.name);
      if (actions == null) {
        throw Error("actions must be defined");
      }
      return actions as CourseActions;
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

    render() {
      const r = this.props.num_running_projects;
      const n = this.props.num_students;
      return (
        <Panel
          header={
            <h4>
              <Icon name="flash" /> Start or stop all student projects
            </h4>
          }
        >
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

interface DisableStudentCollaboratorsPanelProps {
  checked: boolean;
  on_change: (checked: boolean) => void;
}

class DisableStudentCollaboratorsPanel extends Component<
  DisableStudentCollaboratorsPanelProps
> {
  displayName: "DisableStudentCollaboratorsPanel";

  shouldComponentUpdate(props) {
    return this.props.checked !== props.checked;
  }

  render() {
    return (
      <Panel
        header={
          <h4>
            <Icon name="envelope" /> Collaborator policy
          </h4>
        }
      >
        <div
          style={{
            border: "1px solid lightgrey",
            padding: "10px",
            borderRadius: "5px"
          }}
        >
          <Checkbox
            checked={this.props.checked}
            onChange={e => this.props.on_change(e.target.checked)}
          >
            Allow arbitrary collaborators
          </Checkbox>
        </div>
        <hr />
        <span style={{ color: "#666" }}>
          Every collaborator on the project that contains this course is
          automatically added to every student project (and the shared project).
          In addition, each student is a collaborator on their project. If
          students add additional collaborators, by default they will be
          allowed. If you uncheck the above box, then collaborators will be
          automatically removed from projects; in particular, students may not
          add arbitrary collaborators to their projects.
        </span>
      </Panel>
    );
  }
}

interface ConfigurationPanelProps {
  redux: AppRedux;
  name: string;
  path: string;
  project_id: string;
  allow_urls: boolean;
  settings: CourseSettingsRecord;
  project_map: ProjectMap;
  shared_project_id?: string;
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
  displayName: "CourseEditorConfiguration";

  constructor(props) {
    super(props);
    this.state = {
      show_students_pay_dialog: false,
      email_body_error: undefined
    };
    this.check_email_body = debounce(this.check_email_body.bind(this), 50, {
      leading: true,
      trailing: true
    });
  }

  shouldComponentUpdate(props, state) {
    return (
      misc.is_different(this.state, state, [
        "show_students_pay_dialog",
        "email_body_error"
      ]) ||
      misc.is_different(this.props, props, [
        "settings",
        "project_map",
        "shared_project_id",
        "configuring_projects"
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
      <h4>
        <Icon name="header" /> Title and description
      </h4>
    );
  }

  render_title_description() {
    let left;
    if (this.props.settings == null) {
      return <Loading />;
    }
    return (
      <Panel header={this.render_title_desc_header()}>
        <LabeledRow label="Title">
          <TextInput
            text={(left = this.props.settings.get("title")) != null ? left : ""}
            on_change={title => this.get_actions().set_title(title)}
          />
        </LabeledRow>
        <LabeledRow label="Description">
          <MarkdownInput
            persist_id={this.props.name + "course-description"}
            attach_to={this.props.name}
            rows={6}
            type="textarea"
            default_value={this.props.settings.get("description")}
            on_save={desc => this.get_actions().set_description(desc)}
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
      </Panel>
    );
  }

  /*
   * Grade export
   */
  render_grades_header() {
    return (
      <h4>
        <Icon name="table" /> Export grades
      </h4>
    );
  }

  path(ext) {
    // make path more likely to be python-readable...
    let p = misc.replace_all(this.props.path, "-", "_");
    p = misc.split(p).join("_");
    const i = p.lastIndexOf(".");
    return `export_${p.slice(0, i)}.${ext}`;
  }

  open_file = path => {
    return redux.getActions({ project_id: this.props.project_id }).open_file({
      path,
      foreground: true
    });
  };

  write_file = (path, content) => {
    const actions = this.get_actions();
    const id = actions.set_activity({ desc: `Writing ${path}` });
    return webapp_client.write_text_file_to_project({
      project_id: this.props.project_id,
      path,
      content,
      cb: err => {
        actions.set_activity({ id });
        if (!err) {
          return this.open_file(path);
        } else {
          return actions.set_error(`Error writing '${path}' -- '${err}'`);
        }
      }
    });
  };

  // newlines and duplicated double-quotes
  _sanitize_csv_entry = (s: string): string => {
    return s.replace(/\n/g, "\\n").replace(/"/g, '""');
  };

  save_grades_to_csv = () => {
    let assignment;
    const store = this.get_store();
    const assignments = store.get_sorted_assignments();
    // CSV definition: http://edoceo.com/utilitas/csv-file-format
    // i.e. double quotes everywhere (not single!) and double quote in double quotes usually blows up
    const timestamp = webapp_client.server_time().toISOString();
    let content = `# Course '${this.props.settings.get("title")}'\n`;
    content += `# exported ${timestamp}\n`;
    content += "Name,Id,Email,";
    content +=
      (() => {
        const result: any[] = [];
        for (assignment of assignments) {
          result.push(`\"grade: ${assignment.get("path")}\"`);
        }
        return result;
      })().join(",") + ",";
    content +=
      (() => {
        const result1: any[] = [];
        for (assignment of assignments) {
          result1.push(`\"comments: ${assignment.get("path")}\"`);
        }
        return result1;
      })().join(",") + "\n";
    for (var student of store.get_sorted_students()) {
      var left2;
      let grades = (() => {
        const result2: any[] = [];
        for (assignment of assignments) {
          let grade = store.get_grade(assignment, student);
          grade = grade != null ? grade : "";
          grade = this._sanitize_csv_entry(grade);
          result2.push(`\"${grade}\"`);
        }
        return result2;
      })().join(",");

      let comments = (() => {
        const result3: any[] = [];
        for (assignment of assignments) {
          let comment = store.get_comments(assignment, student);
          comment = comment != null ? comment : "";
          comment = this._sanitize_csv_entry(comment);
          result3.push(`\"${comment}\"`);
        }
        return result3;
      })().join(",");
      const name = `\"${this._sanitize_csv_entry(
        store.get_student_name(student)
      )}\"`;
      const email = `\"${
        (left2 = store.get_student_email(student)) != null ? left2 : ""
      }\"`;
      const id = `\"${student.get("student_id")}\"`;
      const line = [name, id, email, grades, comments].join(",");
      content += line + "\n";
    }
    return this.write_file(this.path("csv"), content);
  };

  save_grades_to_py = () => {
    /*
        example:
        course = 'title'
        exported = 'iso date'
        assignments = ['Assignment 1', 'Assignment 2']
        students=[
            {'name':'Foo Bar', 'email': 'foo@bar.com', 'grades':[85,37], 'comments':['Good job', 'Not as good as assignment one :(']},
            {'name':'Bar None', 'email': 'bar@school.edu', 'grades':[15,50], 'comments':['some_comments','Better!']},
        ]
        */
    let assignment;
    const timestamp = webapp_client.server_time().toISOString();
    const store = this.get_store();
    const assignments = store.get_sorted_assignments();
    let content = `course = '${this.props.settings.get("title")}'\n`;
    content += `exported = '${timestamp}'\n`;
    content += "assignments = [";
    content +=
      (() => {
        const result: any[] = [];
        for (assignment of assignments) {
          result.push(`'${assignment.get("path")}'`);
        }
        return result;
      })().join(",") + "]\n";

    content += "students = [\n";

    for (var student of store.get_sorted_students()) {
      let grades = (() => {
        const result1: any[] = [];
        for (assignment of assignments) {
          var left;
          result1.push(
            `'${
              (left = store.get_grade(assignment, student)) != null ? left : ""
            }'`
          );
        }
        return result1;
      })().join(",");
      grades = grades.replace(/\n/g, "\\n");
      let comments = (() => {
        const result2: any[] = [];
        for (assignment of assignments) {
          var left1;
          result2.push(
            `'${
              (left1 = store.get_comments(assignment, student)) != null
                ? left1
                : ""
            }'`
          );
        }
        return result2;
      })().join(",");
      comments = comments.replace(/\n/g, "\\n");
      const name = store.get_student_name(student);
      let email = store.get_student_email(student);
      email = email != null ? `'${email}'` : "None";
      const id = student.get("student_id");
      const line = `    {'name':'${name}', 'id':'${id}', 'email':${email}, 'grades':[${grades}], 'comments':[${comments}]},`;
      content += line + "\n";
    }
    content += "]\n";
    return this.write_file(this.path("py"), content);
  };

  render_save_grades() {
    return (
      <Panel header={this.render_grades_header()}>
        <div style={{ marginBottom: "10px" }}>Save grades to... </div>
        <ButtonToolbar>
          <Button onClick={this.save_grades_to_csv}>
            <Icon name="file-text-o" /> CSV file...
          </Button>
          <Button onClick={this.save_grades_to_py}>
            <Icon name="file-code-o" /> Python file...
          </Button>
        </ButtonToolbar>
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
      </Panel>
    );
  }

  /*
   * Custom invitation email body
   */

  check_email_body(value) {
    if (!this.props.allow_urls && contains_url(value)) {
      this.setState({
        email_body_error: "Sending URLs is not allowed. (anti-spam measure)"
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
      <Panel
        header={
          <h4>
            <Icon name="envelope" /> Email invitation
          </h4>
        }
      >
        <div
          style={{
            border: "1px solid lightgrey",
            padding: "10px",
            borderRadius: "5px"
          }}
        >
          {this.render_email_body_error()}
          <MarkdownInput
            persist_id={this.props.name + "email-invite-body"}
            attach_to={this.props.name}
            rows={6}
            type="textarea"
            default_value={this.get_store().get_email_invite()}
            on_save={body => this.get_actions().set_email_invite(body)}
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
      </Panel>
    );
  }

  render_configure_all_projects(): Rendered {
    return (
      <Panel
        header={
          <h4>
            <Icon name="envelope" /> Reconfigure all projects
          </h4>
        }
      >
        Ensure all projects have the correct students and TA's, titles and
        descriptions set, etc. This will also resend any outstanding email
        invitations.
        <hr />
        <Button
          disabled={this.props.configuring_projects}
          onClick={() => this.get_actions().configure_all_projects(true)}
        >
          {this.props.configuring_projects ? (
            <Icon name="cc-icon-cocalc-ring" spin />
          ) : (
            undefined
          )}{" "}
          Reconfigure all projects
        </Button>
      </Panel>
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

  handle_student_pay_choice = e => {
    return this.get_actions().set_pay_choice("student", e.target.checked);
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
          <Calendar
            value={value != null ? value : this.props.settings.get("pay")}
            on_change={date => this.get_actions().set_course_info(date)}
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

  handle_students_pay_checkbox = e => {
    if (e.target.checked) {
      this.get_actions().set_course_info(this.get_student_pay_when());
    } else {
      this.get_actions().set_course_info("");
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
      <Alert bsStyle="warning">
        <h3>
          <Icon name="arrow-circle-up" /> Require students to upgrade
        </h3>
        <hr />
        <span>
          Click the following checkbox to require that all students in the
          course pay a special discounted{" "}
          <b>one-time ${STUDENT_COURSE_PRICE}</b> fee to move their projects
          from trial servers to members-only computers, enable full internet
          access, and do not see a large red warning message. This lasts four
          months, and{" "}
          <em>you will not be charged (only students are charged).</em>
        </span>

        {this.render_students_pay_checkbox()}
        {this.props.settings.get("pay")
          ? this.render_require_students_pay_when()
          : undefined}
        {this.render_students_pay_submit_buttons()}
      </Alert>
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
      <Panel
        style={{ background: bg }}
        header={
          <h4 style={style}>
            <Icon name="dashboard" /> Require students to upgrade (students pay)
          </h4>
        }
      >
        {this.render_student_pay_choice_checkbox()}
        {(this.props.settings != null
        ? this.props.settings.get("student_pay")
        : undefined)
          ? this.render_student_pay_details()
          : undefined}
      </Panel>
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
      />
    );
  }

  render_delete_shared_project() {
    if (this.props.shared_project_id) {
      return (
        <DeleteSharedProjectPanel
          delete={this.get_actions().delete_shared_project}
        />
      );
    }
  }

  render_delete_students() {
    return (
      <DeleteStudentsPanel
        delete={this.get_actions().delete_all_student_projects}
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
        on_change={this.get_actions().set_allow_collabs}
      />
    );
  }

  render() {
    return (
      <Grid fluid={true} style={{ width: "100%", overflowY: "scroll" }}>
        <Row>
          <Col md={6}>
            {this.render_require_students_pay()}
            {this.render_require_institute_pay()}
            {this.render_save_grades()}
            {this.render_start_all_projects()}
            {this.render_terminal_command()}
            {this.render_delete_students()}
            {this.render_delete_shared_project()}
          </Col>
          <Col md={6}>
            <HelpBox />
            {this.render_title_description()}
            {this.render_email_invite_body()}
            {this.render_disable_students()}
            {this.render_configure_all_projects()}
          </Col>
        </Row>
      </Grid>
    );
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
