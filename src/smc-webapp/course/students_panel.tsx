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
import * as misc from "smc-util/misc";
import { webapp_client } from "../webapp-client";
import { is_different } from "smc-util/misc2";
import { keys } from "underscore";

// React libraries and components
import {
  Component,
  React,
  ReactDOM,
  rclass,
  rtypes,
  AppRedux,
  Rendered
} from "../app-framework";

import {
  Alert,
  Button,
  ButtonToolbar,
  ButtonGroup,
  FormGroup,
  FormControl,
  InputGroup,
  Row,
  Col,
  Grid,
  Well,
  Form
} from "react-bootstrap";

import { Card } from "cocalc-ui";

// CoCalc components
import { WindowedList } from "../r_misc/windowed-list";
const { User } = require("../users");
import { MarkdownInput, SearchInput, TimeAgo } from "../r_misc";
import { ErrorDisplay } from "../r_misc/error-display";
import { Icon } from "../r_misc/icon";
import { Space } from "../r_misc/space";
import { Tip } from "../r_misc/tip";

import { StudentAssignmentInfo, StudentAssignmentInfoHeader } from "./common";
import * as util from "./util";
import * as styles from "./styles";
import { ProjectMap, UserMap } from "../todo-types";
import {
  StudentsMap,
  AssignmentsMap,
  SortDescription,
  StudentRecord,
  CourseStore,
  IsGradingMap
} from "./store";
import { literal } from "../app-framework/literal";
import { redux } from "../frame-editors/generic/test/util";
import { CourseActions } from "./actions";
import { Set } from "immutable";

interface StudentNameDescription {
  full: string;
  first: string;
  last: string;
}

interface StudentsPanelReactProps {
  frame_id?: string; // used for state caching
  name: string;
  redux: AppRedux;
  project_id: string;
  students: StudentsMap;
  user_map: UserMap;
  project_map: ProjectMap;
  assignments: AssignmentsMap;
}

interface StudentsPanelReduxProps {
  expanded_students: Set<string>;
  active_student_sort?: SortDescription;
  get_student_name: (id: string) => string;
  active_feedback_edits: IsGradingMap;
}

interface StudentsPanelState {
  err?: string;
  search: string;
  add_search: string;
  add_searching: boolean;
  add_select?: any;
  existing_students?: any;
  selected_option_nodes?: any;
  show_deleted: boolean;
}

export const StudentsPanel = rclass<StudentsPanelReactProps>(
  class StudentsPanel extends Component<
    StudentsPanelReactProps & StudentsPanelReduxProps,
    StudentsPanelState
  > {
    // student_list not a list, but has one, plus some extra info.
    private student_list:
      | {
          students: any[];
          num_omitted: number;
          num_deleted: number;
        }
      | undefined = undefined;

    constructor(props) {
      super(props);
      this.state = {
        err: undefined,
        search: "",
        add_search: "",
        add_searching: false,
        add_select: undefined,
        existing_students: undefined,
        selected_option_nodes: undefined,
        show_deleted: false
      };
    }

    displayName: "CourseEditorStudents";

    static reduxProps = ({ name }) => {
      return {
        [name]: {
          expanded_students: rtypes.immutable.Set,
          active_student_sort: rtypes.immutable.Map,
          get_student_name: rtypes.func,
          active_feedback_edits: rtypes.immutable.Map
        }
      };
    };

    get_actions = (): CourseActions => {
      return redux.getActions(this.props.name);
    };

    shouldComponentUpdate(props, state) {
      if (
        is_different(this.state, state, ["search", "show_deleted"]) ||
        is_different(this.props, props, [
          "students",
          "user_map",
          "active_student_sort"
        ])
      ) {
        delete this.student_list;
        return true;
      }
      return (
        this.state !== state ||
        is_different(this.props, props, [
          "expanded_students",
          "name",
          "project_id",
          "assignments",
          "active_feedback_edits"
        ])
      );
    }

    do_add_search = e => {
      // Search for people to add to the course
      if (e != null) {
        e.preventDefault();
      }
      if (this.props.students == null) {
        return;
      }
      if (this.state.add_searching) {
        // already searching
        return;
      }
      const search = this.state.add_search.trim();
      if (search.length === 0) {
        this.setState({
          err: undefined,
          add_select: undefined,
          existing_students: undefined,
          selected_option_nodes: undefined
        });
        return;
      }
      this.setState({
        add_searching: true,
        add_select: undefined,
        existing_students: undefined,
        selected_option_nodes: undefined
      });
      const { add_search } = this.state;
      return webapp_client.user_search({
        query: add_search,
        limit: 100,
        cb: (err, select) => {
          let x;
          if (err) {
            this.setState({
              add_searching: false,
              err,
              add_select: undefined,
              existing_students: undefined
            });
            return;
          }
          // Get the current collaborators/owners of the project that contains the course.
          const users = this.props.redux
            .getStore("projects")
            .get_users(this.props.project_id);
          // Make a map with keys the email or account_id is already part of the course.
          const already_added = users.toJS(); // start with collabs on project
          // also track **which** students are already part of the course
          const existing_students: any = {};
          existing_students.account = {};
          existing_students.email = {};
          // For each student in course add account_id and/or email_address:
          this.props.students.map(val => {
            return (() => {
              const result: any[] = [];
              for (const n of literal(["account_id", "email_address"])) {
                if (val.get(n) != null) {
                  result.push((already_added[val.get(n)] = true));
                } else {
                  result.push(undefined);
                }
              }
              return result;
            })();
          });
          // This function returns true if we shouldn't list the given account_id or email_address
          // in the search selector for adding to the class.
          const exclude_add = (account_id, email_address) => {
            const aa =
              already_added[account_id] || already_added[email_address];
            if (aa) {
              if (account_id != null) {
                existing_students.account[account_id] = true;
              }
              if (email_address != null) {
                existing_students.email[email_address] = true;
              }
            }
            return aa;
          };
          const select2 = (() => {
            const result: any[] = [];
            for (x of select) {
              if (!exclude_add(x.account_id, x.email_address)) {
                result.push(x);
              }
            }
            return result;
          })();
          // Put at the front of the list any email addresses not known to CoCalc (sorted in order) and also not invited to course.
          // NOTE (see comment on https://github.com/sagemathinc/cocalc/issues/677): it is very important to pass in
          // the original select list to nonclude_emails below, **NOT** select2 above.  Otherwise, we end up
          // bringing back everything in the search, which is a bug.
          const select3 = (() => {
            const result1: any[] = [];
            for (x of noncloud_emails(select, add_search)) {
              if (!exclude_add(null, x.email_address)) {
                result1.push(x);
              }
            }
            return result1;
          })().concat(select2);
          // We are no longer searching, but now show an options selector.
          this.setState({
            add_searching: false,
            add_select: select3,
            existing_students
          });
        }
      });
    };

    student_add_button() {
      const icon = this.state.add_searching ? (
        <Icon name="cc-icon-cocalc-ring" spin />
      ) : (
        <Icon name="search" />
      );

      return (
        <Button onClick={this.do_add_search}>
          {icon} Search (shift+enter)
        </Button>
      );
    }

    add_selector_clicked = () => {
      return this.setState({
        selected_option_nodes: ReactDOM.findDOMNode(this.refs.add_select)
          .selectedOptions
      });
    };

    add_selected_students = options => {
      const emails = {};
      for (const x of this.state.add_select) {
        if (x.account_id != null) {
          emails[x.account_id] = x.email_address;
        }
      }
      const students: any[] = [];
      const selections: any[] = [];

      // first check, if no student is selected and there is just one in the list
      if (
        (this.state.selected_option_nodes == null ||
          (this.state.selected_option_nodes != null
            ? this.state.selected_option_nodes.length
            : undefined) === 0) &&
        (options != null ? options.length : undefined) === 1
      ) {
        selections.push(options[0].key);
      } else {
        for (const option of this.state.selected_option_nodes) {
          selections.push(option.getAttribute("value"));
        }
      }

      for (const y of selections) {
        if (misc.is_valid_uuid_string(y)) {
          students.push({
            account_id: y,
            email_address: emails[y]
          });
        } else {
          students.push({ email_address: y });
        }
      }
      this.get_actions().add_students(students);
      return this.setState({
        err: undefined,
        add_select: undefined,
        selected_option_nodes: undefined,
        add_search: ""
      });
    };

    add_all_students = () => {
      const students: any[] = [];
      for (const entry of this.state.add_select) {
        const { account_id } = entry;
        if (misc.is_valid_uuid_string(account_id)) {
          students.push({
            account_id,
            email_address: entry.email_address
          });
        } else {
          students.push({ email_address: entry.email_address });
        }
      }
      this.get_actions().add_students(students);
      return this.setState({
        err: undefined,
        add_select: undefined,
        selected_option_nodes: undefined,
        add_search: ""
      });
    };

    get_add_selector_options() {
      const v: any[] = [];
      const seen = {};
      for (const x of this.state.add_select) {
        const key = x.account_id != null ? x.account_id : x.email_address;
        if (seen[key]) {
          continue;
        }
        seen[key] = true;
        const student_name =
          x.account_id != null
            ? x.first_name + " " + x.last_name
            : x.email_address;
        v.push(
          <option key={key} value={key} label={student_name}>
            {student_name}
          </option>
        );
      }
      return v;
    }

    render_add_selector() {
      if (this.state.add_select == null) {
        return;
      }
      const options = this.get_add_selector_options();
      return (
        <FormGroup>
          <FormControl
            componentClass="select"
            multiple
            ref="add_select"
            rows={10}
            onClick={this.add_selector_clicked}
          >
            {options}
          </FormControl>
          <Grid fluid={true} style={{ width: "100%" }}>
            {this.render_add_selector_button(options)}
            <Space />
            {this.render_add_all_students_button(options)}
          </Grid>
        </FormGroup>
      );
    }

    render_add_selector_button(options) {
      let existing;
      const nb_selected =
        (this.state.selected_option_nodes != null
          ? this.state.selected_option_nodes.length
          : undefined) != null
          ? this.state.selected_option_nodes != null
            ? this.state.selected_option_nodes.length
            : undefined
          : 0;
      const es = this.state.existing_students;
      if (es != null) {
        existing = keys(es.email).length + keys(es.account).length > 0;
      } else {
        // es not defined when user clicks the close button on the warning.
        existing = 0;
      }
      const btn_text = (() => {
        switch (options.length) {
          case 0:
            if (existing) {
              return "Student already added";
            } else {
              return "No student found";
            }
          case 1:
            return "Add student";
          default:
            switch (nb_selected) {
              case 0:
                return "Select student above";
              case 1:
                return "Add selected student";
              default:
                return `Add ${nb_selected} students`;
            }
        }
      })();
      const disabled =
        options.length === 0 || (options.length >= 2 && nb_selected === 0);
      return (
        <Button
          onClick={() => this.add_selected_students(options)}
          disabled={disabled}
        >
          <Icon name="user-plus" /> {btn_text}
        </Button>
      );
    }

    render_add_all_students_button(options) {
      let disabled = options.length === 0;
      if (!disabled) {
        disabled =
          ((this.state.selected_option_nodes != null
            ? this.state.selected_option_nodes.length
            : undefined) != null
            ? this.state.selected_option_nodes != null
              ? this.state.selected_option_nodes.length
              : undefined
            : 0) > 0;
      }
      return (
        <Button onClick={() => this.add_all_students()} disabled={disabled}>
          <Icon name={"user-plus"} /> Add all students
        </Button>
      );
    }

    render_error() {
      let ed: any;
      if (this.state.err) {
        ed = (
          <ErrorDisplay
            error={misc.trunc(this.state.err, 1024)}
            onClose={() => this.setState({ err: undefined })}
          />
        );
      } else if (this.state.existing_students != null) {
        const existing: any[] = [];
        for (const email in this.state.existing_students.email) {
          existing.push(email);
        }
        for (const account_id in this.state.existing_students.account) {
          const user = this.props.user_map.get(account_id);
          existing.push(`${user.get("first_name")} ${user.get("last_name")}`);
        }
        if (existing.length > 0) {
          let msg;
          if (existing.length > 1) {
            msg = "Already added students or project collaborators: ";
          } else {
            msg = "Already added student or project collaborator: ";
          }
          msg += existing.join(", ");
          ed = (
            <ErrorDisplay
              bsStyle="info"
              error={msg}
              onClose={() => this.setState({ existing_students: undefined })}
            />
          );
        }
      }
      if (ed != null) {
        return (
          <Grid
            fluid={true}
            style={{ width: "100%", marginTop: "1em", marginBottom: "-10px" }}
          >
            <Row>
              <Col md={5} lgOffset={7}>
                {ed}
              </Col>
            </Row>
          </Grid>
        );
      }
    }

    student_add_input_onChange() {
      const input = ReactDOM.findDOMNode(this.refs.student_add_input);
      this.setState({
        add_select: undefined,
        add_search: input.value
      });
    }

    student_add_input_onKeyDown(e) {
      // ESC key
      if (e.keyCode === 27) {
        return this.setState({
          add_search: "",
          add_select: undefined
        });

        // Shift+Return
      } else if (e.keyCode === 13 && e.shiftKey) {
        e.preventDefault();
        this.student_add_input_onChange();
        this.do_add_search(e);
      }
    }

    render_header(num_omitted) {
      return (
        <Grid
          fluid={true}
          style={{ width: "100%", borderBottom: "1px solid #e5e5e5" }}
        >
          <Row>
            <Col md={3}>
              <SearchInput
                placeholder="Find students..."
                default_value={this.state.search}
                on_change={value => this.setState({ search: value })}
              />
            </Col>
            <Col md={4}>
              {num_omitted ? (
                <h5>(Omitting {num_omitted} students)</h5>
              ) : (
                undefined
              )}
            </Col>
            <Col md={5}>
              <Form onSubmit={this.do_add_search} horizontal>
                <Col md={9}>
                  <FormGroup>
                    <FormControl
                      ref="student_add_input"
                      componentClass="textarea"
                      placeholder="Add students by name or email address..."
                      value={this.state.add_search}
                      onChange={() => this.student_add_input_onChange()}
                      onKeyDown={e => this.student_add_input_onKeyDown(e)}
                    />
                  </FormGroup>
                </Col>
                <Col md={3}>
                  <InputGroup.Button>
                    {this.student_add_button()}
                  </InputGroup.Button>
                </Col>
              </Form>
              {this.render_add_selector()}
            </Col>
          </Row>
          {this.render_error()}
        </Grid>
      );
    }

    private get_student_list(): {
      students: any[];
      num_omitted: number;
      num_deleted: number;
    } {
      // turn map of students into a list
      // account_id     : "bed84c9e-98e0-494f-99a1-ad9203f752cb" # Student's CoCalc account ID
      // email_address  : "4@student.com"                        # Email the instructor signed the student up with.
      // first_name     : "Rachel"                               # Student's first name they use for CoCalc
      // last_name      : "Florence"                             # Student's last name they use for CoCalc
      // project_id     : "6bea25c7-da96-4e92-aa50-46ebee1994ca" # Student's project ID for this course
      // student_id     : "920bdad2-9c3a-40ab-b5c0-eb0b3979e212" # Student's id for this course
      // last_active    : 2357025
      // create_project : number -- server timestamp of when create started
      // deleted        : False
      // note           : "Is younger sister of Abby Florence (TA)"
      if (this.student_list != null) return this.student_list;

      let students = util.parse_students(
        this.props.students,
        this.props.user_map,
        this.props.redux
      );
      if (this.props.active_student_sort != null) {
        students.sort(
          util.pick_student_sorter(this.props.active_student_sort.toJS())
        );
        if (this.props.active_student_sort.get("is_descending")) {
          students.reverse();
        }
      }

      // Deleted and non-deleted students
      const deleted: any[] = [];
      const non_deleted: any[] = [];
      for (const x of students) {
        if (x.deleted) {
          deleted.push(x);
        } else {
          non_deleted.push(x);
        }
      }
      const num_deleted = deleted.length;

      students = non_deleted;
      if (this.state.show_deleted) {
        // but show at the end...
        students = students.concat(deleted);
      }

      let num_omitted = 0;
      if (this.state.search) {
        const words = misc.split(this.state.search.toLowerCase());
        const search = a =>
          (
            (a.last_name != null ? a.last_name : "") +
            (a.first_name != null ? a.first_name : "") +
            (a.email_address != null ? a.email_address : "")
          ).toLowerCase();
        const match = function(s) {
          for (const word of words) {
            if (s.indexOf(word) === -1) {
              num_omitted += 1;
              return false;
            }
          }
          return true;
        };
        const w3: any[] = [];
        for (const x of students) {
          if (match(search(x))) {
            w3.push(x);
          }
        }
        students = w3;
      }

      this.student_list = { students, num_omitted, num_deleted };
      return this.student_list;
    }

    private render_sort_icon(column_name: string): Rendered {
      if (
        this.props.active_student_sort == null ||
        this.props.active_student_sort.get("column_name") != column_name
      )
        return;
      return (
        <Icon
          style={{ marginRight: "10px" }}
          name={
            this.props.active_student_sort.get("is_descending")
              ? "caret-up"
              : "caret-down"
          }
        />
      );
    }

    private render_sort_link(
      column_name: string,
      display_name: string
    ): Rendered {
      return (
        <a
          href=""
          onClick={e => {
            e.preventDefault();
            return this.get_actions().set_active_student_sort(column_name);
          }}
        >
          {display_name}
          <Space />
          {this.render_sort_icon(column_name)}
        </a>
      );
    }

    private render_student_table_header(): Rendered {
      // HACK: that marginRight is to get things to line up with students.
      // This is done all wrong due to using react-window...  We need
      // to make an extension to our WindowedList that supports explicit
      // headers (and uses css grid).
      return (
        <Grid fluid={true} style={{ width: "100%" }}>
          <Row style={{ marginRight: 0 }}>
            <Col md={3}>
              <div style={{ display: "inline-block", width: "50%" }}>
                {this.render_sort_link("first_name", "First Name")}
              </div>
              <div style={{ display: "inline-block" }}>
                {this.render_sort_link("last_name", "Last Name")}
              </div>
            </Col>
            <Col md={2}>{this.render_sort_link("email", "Email Address")}</Col>
            <Col md={4}>
              {this.render_sort_link("last_active", "Last Active")}
            </Col>
            <Col md={3}>{this.render_sort_link("hosting", "Hosting Type")}</Col>
          </Row>
        </Grid>
      );
    }

    get_student(id: string): StudentRecord {
      const student = this.props.students.get(id);
      if (student == undefined) {
        console.warn(`Tried to access undefined student ${id}`);
      }
      return student as any;
    }

    private render_student(student_id: string, index: number): Rendered {
      const x = this.get_student_list().students[index];
      if (x == null) return;
      const name: StudentNameDescription = {
        full: this.props.get_student_name(x.student_id),
        first: x.first_name,
        last: x.last_name
      };
      return (
        <Student
          background={index % 2 === 0 ? "#eee" : undefined}
          key={student_id}
          student_id={student_id}
          student={this.get_student(student_id)}
          user_map={this.props.user_map}
          redux={this.props.redux}
          name={this.props.name}
          project_map={this.props.project_map}
          assignments={this.props.assignments}
          is_expanded={this.props.expanded_students.has(student_id)}
          student_name={name}
          display_account_name={true}
          active_feedback_edits={this.props.active_feedback_edits}
        />
      );
    }

    private render_students(students): Rendered {
      if (students.length == 0) {
        return this.render_no_students();
      }
      return (
        <WindowedList
          overscan_row_count={5}
          estimated_row_size={37}
          row_count={students.length}
          row_renderer={({ key, index }) => this.render_student(key, index)}
          row_key={index =>
            students[index] != null ? students[index].student_id : undefined
          }
          cache_id={`course-student-${this.props.name}-${this.props.frame_id}`}
        />
      );
    }

    private render_no_students(): Rendered {
      return (
        <Alert
          bsStyle="info"
          style={{
            margin: "auto",
            fontSize: "12pt",
            maxWidth: "800px"
          }}
        >
          <h3>Add Students to your Course</h3>
          Add some students to your course by entering their email addresses in
          the box in the upper right, then click on Search.
        </Alert>
      );
    }

    render_show_deleted(num_deleted, shown_students) {
      if (this.state.show_deleted) {
        return (
          <Button
            style={styles.show_hide_deleted({
              needs_margin: shown_students.length > 0
            })}
            onClick={() => this.setState({ show_deleted: false })}
          >
            <Tip
              placement="left"
              title="Hide deleted"
              tip="Students are never really deleted.  Click this button so that deleted students aren't included at the bottom of the list of students.  Deleted students are always hidden from the list of grades."
            >
              Hide {num_deleted} deleted students
            </Tip>
          </Button>
        );
      } else {
        return (
          <Button
            style={styles.show_hide_deleted({
              needs_margin: shown_students.length > 0
            })}
            onClick={() => this.setState({ show_deleted: true, search: "" })}
          >
            <Tip
              placement="left"
              title="Show deleted"
              tip="Students are not deleted forever, even after you delete them.  Click this button to show any deleted students at the bottom of the list.  You can then click on the student and click undelete to bring the assignment back."
            >
              Show {num_deleted} deleted students
            </Tip>
          </Button>
        );
      }
    }

    private render_student_info(students, num_deleted): Rendered {
      return (
        <div className="smc-vfill">
          {students.length > 0 ? this.render_student_table_header() : undefined}
          {this.render_students(students)}
          {num_deleted
            ? this.render_show_deleted(num_deleted, students)
            : undefined}
        </div>
      );
    }

    render() {
      const { students, num_omitted, num_deleted } = this.get_student_list();

      return (
        <div className="smc-vfill">
          {this.render_header(num_omitted)}
          {this.render_student_info(students, num_deleted)}
        </div>
      );
    }
  }
);

export function StudentsPanelHeader(props: { n: number }) {
  return (
    <Tip
      delayShow={1300}
      title="Students"
      tip="This tab lists all students in your course, along with their grades on each assignment.  You can also quickly find students by name on the left and add new students on the right."
    >
      <span>
        <Icon name="users" /> Students{" "}
        {(props != null ? props.n : undefined) != null ? ` (${props.n})` : ""}
      </span>
    </Tip>
  );
}

/*
 Updates based on:
  - Expanded/Collapsed
  - If collapsed: First name, last name, email, last active, hosting type
  - If expanded: Above +, Student's status on all assignments,

*/
interface StudentProps {
  redux: object;
  name: string;
  student: StudentRecord;
  student_id: string;
  user_map: UserMap;
  project_map: ProjectMap; // here entirely to cause an update when project activity happens
  assignments: AssignmentsMap; // here entirely to cause an update when project activity happens
  background?: string;
  is_expanded?: boolean;
  student_name: StudentNameDescription;
  display_account_name?: boolean;
  active_feedback_edits: IsGradingMap;
}

interface StudentState {
  confirm_delete: boolean;
  editing_student: boolean;
  edited_first_name: string;
  edited_last_name: string;
  edited_email_address: string;
  more: boolean;
}

class Student extends Component<StudentProps, StudentState> {
  constructor(props) {
    super(props);
    this.state = this.get_initial_state();
  }

  displayName: "CourseEditorStudent";

  get_actions = (): CourseActions => {
    return redux.getActions(this.props.name);
  };

  get_store = (): CourseStore => {
    return redux.getStore(this.props.name) as any;
  };

  get_initial_state() {
    return {
      confirm_delete: false,
      editing_student: false,
      edited_first_name: this.props.student_name.first || "",
      edited_last_name: this.props.student_name.last || "",
      edited_email_address: this.props.student.get("email_address") || "",
      more: false
    };
  }

  shouldComponentUpdate(nextProps, nextState) {
    return (
      is_different(this.state, nextState, [
        "confirm_delete",
        "editing_student",
        "edited_first_name",
        "edited_last_name",
        "edited_email_address"
      ]) ||
      is_different(this.props, nextProps, [
        "name",
        "student",
        "user_map",
        "project_map",
        "assignments",
        "background",
        "is_expanded",
        "active_feedback_edits"
      ]) ||
      (this.props.student_name != null
        ? this.props.student_name.full
        : undefined) !==
        (nextProps.student_name != null
          ? nextProps.student_name.full
          : undefined)
    );
  }

  componentWillReceiveProps(next) {
    if (this.props.student_name.first !== next.student_name.first) {
      this.setState({ edited_first_name: next.student_name.first });
    }
    if (this.props.student_name.last !== next.student_name.last) {
      this.setState({ edited_last_name: next.student_name.last });
    }
    if (
      this.props.student.get("email_address") !==
      next.student.get("email_address")
    ) {
      return this.setState({
        edited_email_address: next.student.get("email_address")
      });
    }
  }

  on_key_down = e => {
    switch (e.keyCode) {
      case 13:
        return this.save_student_changes();
      case 27:
        return this.cancel_student_edit();
    }
  };

  toggle_show_more = e => {
    e.preventDefault();
    if (this.state.editing_student) {
      this.cancel_student_edit();
    }
    const item_id = this.props.student.get("student_id");
    this.get_actions().toggle_item_expansion("student", item_id);
  };

  render_student() {
    return (
      <a href="" onClick={this.toggle_show_more}>
        <Icon
          style={{ marginRight: "10px" }}
          name={this.props.is_expanded ? "caret-down" : "caret-right"}
        />
        {this.render_student_name()}
      </a>
    );
  }

  render_student_name() {
    const account_id = this.props.student.get("account_id");
    if (account_id != null) {
      return (
        <User
          account_id={account_id}
          user_map={this.props.user_map}
          name={this.props.student_name.full}
          show_original={this.props.display_account_name}
        />
      );
    }
    return <span>{this.props.student.get("email_address")} (invited)</span>;
  }

  render_student_email() {
    const email = this.props.student.get("email_address");
    return (
      <a target={"_blank"} href={`mailto:${email}`} rel={"noopener"}>
        {email}
      </a>
    );
  }

  open_project = () => {
    redux.getActions("projects").open_project({
      project_id: this.props.student.get("project_id")
    });
  };

  create_project = () => {
    this.get_actions().create_student_project(this.props.student_id);
  };

  render_last_active() {
    if (this.props.student.get("account_id") == null) {
      return (
        <span style={{ color: "#666" }}>(has not created account yet)</span>
      );
    }
    const student_project_id = this.props.student.get("project_id");
    if (student_project_id == null) {
      return;
    }
    const p = this.props.project_map.get(student_project_id);
    if (p == null) {
      // no info about this project?  maybe we need to load full list or
      // users isn't a collab, so don't know.
      const project_actions = redux.getActions("projects");
      if (project_actions != null) {
        // If this does load all (since not loaded), then will try again to
        // render with new project_map.
        project_actions.load_all_projects();
      }
      return;
    }
    const u = p.get("last_active");
    const last_active =
      u != null ? u.get(this.props.student.get("account_id")) : null;
    if (last_active) {
      // student has definitely been active (and we know about this project).
      return (
        <span style={{ color: "#666" }}>
          (last used project <TimeAgo date={last_active} />)
        </span>
      );
    } else {
      return <span style={{ color: "#666" }}>(has never used project)</span>;
    }
  }

  render_hosting() {
    const student_project_id = this.props.student.get("project_id");
    if (student_project_id) {
      const upgrades = redux
        .getStore("projects")
        .get_total_project_quotas(student_project_id);
      if (upgrades == null) {
        // user opening the course isn't a collaborator on this student project yet
        return;
      }
      if (upgrades.member_host) {
        return (
          <Tip
            placement="left"
            title={
              <span>
                <Icon name="check" /> Members-only hosting
              </span>
            }
            tip="Projects is on a members-only server, which is much more robust and has priority support."
          >
            <span style={{ color: "#888", cursor: "pointer" }}>
              <Icon name="check" /> Members-only
            </span>
          </Tip>
        );
      } else {
        return (
          <Tip
            placement="left"
            title={
              <span>
                <Icon name="exclamation-triangle" /> Free hosting
              </span>
            }
            tip="Project is hosted on a free server, so it may be overloaded and will be rebooted frequently.  Please upgrade in course settings."
          >
            <span style={{ color: "#888", cursor: "pointer" }}>
              <Icon name="exclamation-triangle" /> Free
            </span>
          </Tip>
        );
      }
    }
  }

  render_project_access() {
    // first check if the project is currently being created
    const create = this.props.student.get("create_project");
    if (create != null) {
      // if so, how long ago did it start
      const how_long = (webapp_client.server_time() - create) / 1000;
      if (how_long < 120) {
        // less than 2 minutes -- still hope, so render that creating
        return (
          <div>
            <Icon name="cc-icon-cocalc-ring" spin /> Creating project...
            (started <TimeAgo date={create} />)
          </div>
        );
      }
    }
    // otherwise, maybe user killed file before finished or something and it is lost; give them the chance
    // to attempt creation again by clicking the create button.

    const student_project_id = this.props.student.get("project_id");
    if (student_project_id != null) {
      return (
        <ButtonToolbar>
          <ButtonGroup>
            <Button onClick={this.open_project}>
              <Tip
                placement="right"
                title="Student project"
                tip="Open the course project for this student."
              >
                <Icon name="edit" /> Open student project
              </Tip>
            </Button>
          </ButtonGroup>
          {this.props.student.get("account_id")
            ? this.render_edit_student()
            : undefined}
        </ButtonToolbar>
      );
    } else {
      return (
        <Tip
          placement="right"
          title="Create the student project"
          tip="Create a new project for this student, then add the student as a collaborator, and also add any collaborators on the project containing this course."
        >
          <Button onClick={this.create_project}>
            <Icon name="plus-circle" /> Create student project
          </Button>
        </Tip>
      );
    }
  }

  student_changed() {
    return (
      this.props.student_name.first !== this.state.edited_first_name ||
      this.props.student_name.last !== this.state.edited_last_name ||
      this.props.student.get("email_address") !==
        this.state.edited_email_address
    );
  }

  render_edit_student() {
    if (this.state.editing_student) {
      const disable_save = !this.student_changed();
      return (
        <ButtonGroup>
          <Button
            onClick={this.save_student_changes}
            bsStyle="success"
            disabled={disable_save}
          >
            <Icon name="save" /> Save
          </Button>
          <Button onClick={this.cancel_student_edit}>Cancel</Button>
        </ButtonGroup>
      );
    } else {
      return (
        <Button onClick={this.show_edit_name_dialogue}>
          <Icon name="address-card-o" /> Edit student...
        </Button>
      );
    }
  }

  cancel_student_edit = () => {
    this.setState(this.get_initial_state());
  };

  save_student_changes = () => {
    this.get_actions().set_internal_student_info(this.props.student, {
      first_name: this.state.edited_first_name,
      last_name: this.state.edited_last_name,
      email_address: this.state.edited_email_address
    });

    this.setState({ editing_student: false });
  };

  show_edit_name_dialogue = () => {
    this.setState({ editing_student: true });
  };

  delete_student = () => {
    this.get_actions().delete_student(this.props.student);
    this.setState({ confirm_delete: false });
  };

  undelete_student = () => {
    this.get_actions().undelete_student(this.props.student);
  };

  render_confirm_delete() {
    if (this.state.confirm_delete) {
      return (
        <div>
          Are you sure you want to delete this student (you can always undelete
          them later)?
          <Space />
          <ButtonToolbar>
            <Button onClick={this.delete_student} bsStyle="danger">
              <Icon name="trash" /> YES, Delete
            </Button>
            <Button onClick={() => this.setState({ confirm_delete: false })}>
              Cancel
            </Button>
          </ButtonToolbar>
        </div>
      );
    }
  }

  render_delete_button() {
    if (!this.props.is_expanded) {
      return;
    }
    if (this.state.confirm_delete) {
      return this.render_confirm_delete();
    }
    if (this.props.student.get("deleted")) {
      return (
        <Button onClick={this.undelete_student} style={{ float: "right" }}>
          <Icon name="trash-o" /> Undelete
        </Button>
      );
    } else {
      return (
        <Button
          onClick={() => this.setState({ confirm_delete: true })}
          style={{ float: "right" }}
        >
          <Icon name="trash" /> Delete...
        </Button>
      );
    }
  }

  render_title_due(assignment) {
    const date = assignment.get("due_date");
    if (date) {
      return (
        <span>
          (Due <TimeAgo date={date} />)
        </span>
      );
    }
  }

  render_title(assignment) {
    return (
      <span>
        <em>{misc.trunc_middle(assignment.get("path"), 50)}</em>{" "}
        {this.render_title_due(assignment)}
      </span>
    );
  }

  render_assignments_info_rows() {
    const store = this.get_store();
    const result: any[] = [];
    for (const assignment of store.get_sorted_assignments()) {
      const grade = store.get_grade(assignment, this.props.student);
      const comments = store.get_comments(assignment, this.props.student);
      const info = store.student_assignment_info(
        this.props.student,
        assignment
      );
      const key = util.assignment_identifier(assignment, this.props.student);
      const edited_feedback = this.props.active_feedback_edits.get(key);
      let edited_comments: string | undefined;
      let edited_grade: string | undefined;
      if (edited_feedback != undefined) {
        edited_comments = edited_feedback.get("edited_comments");
        edited_grade = edited_feedback.get("edited_grade");
      }
      result.push(
        <StudentAssignmentInfo
          key={assignment.get("assignment_id")}
          title={this.render_title(assignment)}
          name={this.props.name}
          student={this.props.student}
          assignment={assignment}
          grade={grade}
          comments={comments}
          info={info}
          is_editing={!!edited_feedback}
          edited_comments={edited_comments}
          edited_grade={edited_grade}
        />
      );
    }
    return result;
  }

  render_assignments_info() {
    const peer_grade = this.get_store().any_assignment_uses_peer_grading();
    const header = (
      <StudentAssignmentInfoHeader
        key="header"
        title="Assignment"
        peer_grade={peer_grade}
      />
    );
    return [header, this.render_assignments_info_rows()];
  }

  render_note() {
    return (
      <Row key="note" style={styles.note}>
        <Col xs={2}>
          <Tip
            title="Notes about this student"
            tip="Record notes about this student here. These notes are only visible to you, not to the student.  In particular, you might want to include an email address or other identifying information here, and notes about late assignments, excuses, etc."
          >
            Private Student Notes
          </Tip>
        </Col>
        <Col xs={10}>
          <MarkdownInput
            persist_id={this.props.student.get("student_id") + "note"}
            attach_to={this.props.name}
            rows={6}
            placeholder="Notes about student (not visible to student)"
            default_value={this.props.student.get("note")}
            on_save={value =>
              this.get_actions().set_student_note(this.props.student, value)
            }
          />
        </Col>
      </Row>
    );
  }

  render_more_info() {
    // Info for each assignment about the student.
    const v: any[] = [];
    v.push(
      <Row key="more">
        <Col md={12}>{this.render_assignments_info()}</Col>
      </Row>
    );
    v.push(this.render_note());
    return v;
  }

  render_basic_info() {
    return (
      <Row key="basic" style={{ backgroundColor: this.props.background }}>
        <Col md={3}>
          <h6>
            {this.render_student()}
            {this.render_deleted()}
          </h6>
        </Col>
        <Col md={2}>
          <h6 style={{ color: "#666" }}>{this.render_student_email()}</h6>
        </Col>
        <Col md={4} style={{ paddingTop: "10px" }}>
          {this.render_last_active()}
        </Col>
        <Col md={3} style={{ paddingTop: "10px" }}>
          {this.render_hosting()}
        </Col>
      </Row>
    );
  }

  render_deleted() {
    if (this.props.student.get("deleted")) {
      return <b> (deleted)</b>;
    }
  }

  render_panel_header() {
    return (
      <div>
        <Row>
          <Col md={8}>{this.render_project_access()}</Col>
          <Col md={4}>{this.render_delete_button()}</Col>
        </Row>
        {this.state.editing_student ? (
          <Row>
            <Col md={4}>{this.render_edit_student_interface()}</Col>
          </Row>
        ) : (
          undefined
        )}
      </div>
    );
  }

  render_edit_student_interface() {
    return (
      <Well style={{ marginTop: "10px" }}>
        <Row>
          <Col md={6}>
            First Name
            <FormGroup>
              <FormControl
                type="text"
                autoFocus={true}
                value={this.state.edited_first_name}
                onClick={e => {
                  e.stopPropagation();
                  e.preventDefault();
                }}
                onChange={e =>
                  this.setState({ edited_first_name: (e.target as any).value })
                }
                onKeyDown={this.on_key_down}
              />
            </FormGroup>
          </Col>
          <Col md={6}>
            Last Name
            <FormGroup>
              <FormControl
                type="text"
                value={this.state.edited_last_name}
                onClick={e => {
                  e.stopPropagation();
                  e.preventDefault();
                }}
                onChange={e =>
                  this.setState({ edited_last_name: (e.target as any).value })
                }
                onKeyDown={this.on_key_down}
              />
            </FormGroup>
          </Col>
        </Row>
        <Row>
          <Col md={12}>
            Email Address
            <FormGroup>
              <FormControl
                type="text"
                value={this.state.edited_email_address}
                onClick={e => {
                  e.stopPropagation();
                  e.preventDefault();
                }}
                onChange={e =>
                  this.setState({ edited_email_address: (e.target as any).value })
                }
                onKeyDown={this.on_key_down}
              />
            </FormGroup>
          </Col>
        </Row>
      </Well>
    );
  }

  render_more_panel() {
    return (
      <Row>
        <Card title={this.render_panel_header()}>
          {this.render_more_info()}
        </Card>
      </Row>
    );
  }

  render() {
    return (
      <Grid fluid={true} style={{ width: "100%" }}>
        <Row style={this.state.more ? styles.selected_entry : undefined}>
          <Col xs={12}>
            {this.render_basic_info()}
            {this.props.is_expanded ? this.render_more_panel() : undefined}
          </Col>
        </Row>
      </Grid>
    );
  }
}

var noncloud_emails = function(v, s) {
  // Given a list v of user_search results, and a search string s,
  // return entries for each email address not in v, in order.
  let r;
  const { email_queries } = misc.parse_user_search(s);
  const result_emails = misc.dict(
    (() => {
      const result: any[] = [];
      for (r of v) {
        if (r.email_address != null) {
          result.push([r.email_address, true]);
        }
      }
      return result;
    })()
  );
  return (() => {
    const result1: any[] = [];
    for (r of email_queries) {
      if (!result_emails[r]) {
        result1.push({ email_address: r });
      }
    }
    return result1;
  })().sort((a, b) => misc.cmp(a.email_address, b.email_address));
};
