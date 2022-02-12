/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// CoCalc libraries
import * as misc from "@cocalc/util/misc";
import { is_different, search_match, search_split } from "@cocalc/util/misc";
import { webapp_client } from "../../webapp-client";
import { keys } from "underscore";

// React libraries and components
import {
  Component,
  ReactDOM,
  rclass,
  rtypes,
  AppRedux,
  Rendered,
} from "../../app-framework";

import {
  Button,
  FormGroup,
  FormControl,
  InputGroup,
  Form,
} from "../../antd-bootstrap";

import { Alert, Row, Col } from "antd";

// CoCalc components
import {
  SearchInput,
  WindowedList,
  ErrorDisplay,
  Icon,
  Space,
  Tip,
} from "../../components";

import * as util from "../util";
import { ProjectMap, UserMap } from "../../todo-types";
import {
  StudentsMap,
  AssignmentsMap,
  SortDescription,
  StudentRecord,
  IsGradingMap,
  NBgraderRunInfo,
} from "../store";
import { redux } from "../../frame-editors/generic/test/util";
import { CourseActions } from "../actions";
import { Set } from "immutable";
import { Student, StudentNameDescription } from "./students-panel-student";

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
  active_feedback_edits: IsGradingMap;
  nbgrader_run_info?: NBgraderRunInfo;
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
    private is_unmounted: boolean;
    componentWillUnmount(): void {
      this.is_unmounted = true;
    }

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
        show_deleted: false,
      };
    }

    static reduxProps = ({ name }) => {
      return {
        [name]: {
          expanded_students: rtypes.immutable.Set,
          active_student_sort: rtypes.immutable.Map,
          active_feedback_edits: rtypes.immutable.Map,
          nbgrader_run_info: rtypes.immutable.Map,
        },
        projects: {
          project_map: rtypes.immutable.Map,
        },
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
          "active_student_sort",
          "project_map",
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
          "active_feedback_edits",
          "nbgrader_run_info",
        ])
      );
    }

    private async do_add_search(e): Promise<void> {
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
          selected_option_nodes: undefined,
        });
        return;
      }
      this.setState({
        add_searching: true,
        add_select: undefined,
        existing_students: undefined,
        selected_option_nodes: undefined,
      });
      const { add_search } = this.state;
      let select;
      try {
        select = await webapp_client.users_client.user_search({
          query: add_search,
          limit: 150,
        });
      } catch (err) {
        if (this.is_unmounted) return;
        this.setState({
          add_searching: false,
          err,
          add_select: undefined,
          existing_students: undefined,
        });
        return;
      }
      if (this.is_unmounted) return;

      // Get the current collaborators/owners of the project that
      // contains the course.
      const users = this.props.redux
        .getStore("projects")
        .get_users(this.props.project_id);
      // Make a map with keys the email or account_id is already part of the course.
      const already_added = users?.toJS() ?? {}; // start with collabs on project
      // also track **which** students are already part of the course
      const existing_students: any = {};
      existing_students.account = {};
      existing_students.email = {};
      // For each student in course add account_id and/or email_address:
      this.props.students.map((val) => {
        for (const n of ["account_id", "email_address"] as const) {
          if (val.get(n) != null) {
            already_added[val.get(n)] = true;
          }
        }
      });
      // This function returns true if we shouldn't list the given account_id or email_address
      // in the search selector for adding to the class.
      const exclude_add = (account_id, email_address): boolean => {
        const aa = already_added[account_id] || already_added[email_address];
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
      const select2: any[] = [];
      for (const x of select) {
        if (!exclude_add(x.account_id, x.email_address)) {
          select2.push(x);
        }
      }
      // Put at the front of the list any email addresses not known to CoCalc (sorted in order) and also not invited to course.
      // NOTE (see comment on https://github.com/sagemathinc/cocalc/issues/677): it is very important to pass in
      // the original select list to nonclude_emails below, **NOT** select2 above.  Otherwise, we end up
      // bringing back everything in the search, which is a bug.
      const select3: any[] = select2;
      for (const x of noncloud_emails(select, add_search)) {
        if (!exclude_add(null, x.email_address)) {
          select3.unshift(x);
        }
      }
      // We are no longer searching, but now show an options selector.
      this.setState({
        add_searching: false,
        add_select: select3,
        existing_students,
      });
    }

    student_add_button() {
      if (this.state.add_search?.trim().length == 0) return;
      const icon = this.state.add_searching ? (
        <Icon name="cocalc-ring" spin />
      ) : (
        <Icon name="search" />
      );

      return (
        <Button onClick={this.do_add_search.bind(this)}>
          {icon} Search (shift+enter)
        </Button>
      );
    }

    add_selector_clicked = () => {
      return this.setState({
        selected_option_nodes: ReactDOM.findDOMNode(this.refs.add_select)
          .selectedOptions,
      });
    };

    add_selected_students = (options) => {
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
            email_address: emails[y],
          });
        } else {
          students.push({ email_address: y });
        }
      }
      this.get_actions().students.add_students(students);
      this.clear();
    };

    add_all_students = () => {
      const students: any[] = [];
      for (const entry of this.state.add_select) {
        const { account_id } = entry;
        if (misc.is_valid_uuid_string(account_id)) {
          students.push({
            account_id,
            email_address: entry.email_address,
          });
        } else {
          students.push({ email_address: entry.email_address });
        }
      }
      this.get_actions().students.add_students(students);
      this.clear();
    };

    private clear(): void {
      return this.setState({
        err: undefined,
        add_select: undefined,
        selected_option_nodes: undefined,
        add_search: "",
      });
    }

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
        <FormGroup style={{ margin: "5px 0 15px 15px" }}>
          <FormControl
            componentClass="select"
            multiple
            ref="add_select"
            rows={10}
            onClick={this.add_selector_clicked}
          >
            {options}
          </FormControl>
          <div style={{ marginTop: "5px" }}>
            {this.render_cancel()}
            <Space />
            {this.render_add_selector_button(options)}
            <Space />
            {this.render_add_all_students_button(options)}
          </div>
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

    private render_cancel(): Rendered {
      return <Button onClick={() => this.clear()}>Cancel</Button>;
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
            msg =
              "Already added (or deleted) students or project collaborators: ";
          } else {
            msg =
              "Already added (or deleted) student or project collaborator: ";
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
          <div style={{ marginTop: "1em", marginBottom: "15px" }}>
            <Row>
              <Col md={10} offset={14}>
                {ed}
              </Col>
            </Row>
          </div>
        );
      }
    }

    student_add_input_onChange() {
      const input = ReactDOM.findDOMNode(this.refs.student_add_input);
      this.setState({
        add_select: undefined,
        add_search: input.value,
      });
    }

    student_add_input_onKeyDown(e) {
      // ESC key
      if (e.keyCode === 27) {
        return this.setState({
          add_search: "",
          add_select: undefined,
        });

        // Shift+Return
      } else if (e.keyCode === 13 && e.shiftKey) {
        e.preventDefault();
        this.student_add_input_onChange();
        this.do_add_search(e);
      }
    }

    render_header(num_omitted) {
      // TODO: get rid of all of the bootstrap form crap below.  I'm basically
      // using inline styles to undo the spacing screwups they cause, so it doesn't
      // look like total crap.
      return (
        <div>
          <Row>
            <Col md={6}>
              <SearchInput
                placeholder="Find students..."
                default_value={this.state.search}
                on_change={(value) => this.setState({ search: value })}
              />
            </Col>
            <Col md={6}>
              {num_omitted ? (
                <h5>(Omitting {num_omitted} students)</h5>
              ) : undefined}
            </Col>
            <Col md={10}>
              <Form
                onSubmit={this.do_add_search.bind(this)}
                horizontal
                style={{ marginLeft: "15px" }}
              >
                <Row>
                  <Col md={18}>
                    <FormGroup style={{ margin: "0 0 5px 0" }}>
                      <FormControl
                        ref="student_add_input"
                        componentClass="textarea"
                        placeholder="Add students by name or email address..."
                        value={this.state.add_search}
                        onChange={() => this.student_add_input_onChange()}
                        onKeyDown={(e) => this.student_add_input_onKeyDown(e)}
                      />
                    </FormGroup>
                  </Col>
                  <Col md={6}>
                    <div style={{ marginLeft: "15px", width: "100%" }}>
                      <InputGroup.Button>
                        {this.student_add_button()}
                      </InputGroup.Button>
                    </div>
                  </Col>
                </Row>
              </Form>
              {this.render_add_selector()}
            </Col>
          </Row>
          {this.render_error()}
        </div>
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
        const words = search_split(this.state.search.toLowerCase());
        const search = (x) =>
          `${x.first_name ?? ""} ${x.last_name ?? ""} ${
            x.email_address ?? ""
          }`.toLowerCase();
        const w: any[] = [];
        for (const x of students) {
          if (search_match(search(x), words)) {
            w.push(x);
          }
        }
        students = w;
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
          onClick={(e) => {
            e.preventDefault();
            return this.get_actions().students.set_active_student_sort(
              column_name
            );
          }}
        >
          {display_name}
          <Space />
          {this.render_sort_icon(column_name)}
        </a>
      );
    }

    private render_student_table_header(num_deleted: number): Rendered {
      // HACK: that marginRight is to get things to line up with students.
      // This is done all wrong due to using react-window...  We need
      // to make an extension to our WindowedList that supports explicit
      // headers (and uses css grid).
      return (
        <div>
          <Row style={{ marginRight: 0 }}>
            <Col md={6}>
              <div style={{ display: "inline-block", width: "50%" }}>
                {this.render_sort_link("first_name", "First Name")}
              </div>
              <div style={{ display: "inline-block" }}>
                {this.render_sort_link("last_name", "Last Name")}
              </div>
            </Col>
            <Col md={4}>{this.render_sort_link("email", "Email Address")}</Col>
            <Col md={8}>
              {this.render_sort_link("last_active", "Last Active")}
            </Col>
            <Col md={3}>
              {this.render_sort_link("hosting", "Project Status")}
            </Col>
            <Col md={3}>
              {num_deleted ? this.render_show_deleted(num_deleted) : undefined}
            </Col>
          </Row>
        </div>
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
      const store = this.get_actions().get_store();
      if (store == null) return;
      const name: StudentNameDescription = {
        full: store.get_student_name(x.student_id),
        first: x.first_name,
        last: x.last_name,
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
          nbgrader_run_info={this.props.nbgrader_run_info}
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
          row_key={(index) =>
            students[index] != null ? students[index].student_id : undefined
          }
          cache_id={`course-student-${this.props.name}-${this.props.frame_id}`}
        />
      );
    }

    private render_no_students(): Rendered {
      return (
        <Alert
          type="info"
          style={{
            margin: "auto",
            fontSize: "12pt",
            maxWidth: "800px",
          }}
          message={
            <div>
              <h3>Add Students to your Course</h3>
              Add some students to your course by entering their email addresses
              in the box in the upper right, then click on Search.
            </div>
          }
        />
      );
    }

    render_show_deleted(num_deleted) {
      if (this.state.show_deleted) {
        return (
          <a onClick={() => this.setState({ show_deleted: false })}>
            <Tip
              placement="left"
              title="Hide deleted"
              tip="Click here to hide deleted students from the bottom of the list of students."
            >
              (hide {num_deleted} deleted {misc.plural(num_deleted, "student")})
            </Tip>
          </a>
        );
      } else {
        return (
          <a onClick={() => this.setState({ show_deleted: true, search: "" })}>
            <Tip
              placement="left"
              title="Show deleted"
              tip="Click here to show all deleted students at the bottom of the list.  You can then click on the student and click undelete if necessary."
            >
              (show {num_deleted} deleted {misc.plural(num_deleted, "student")})
            </Tip>
          </a>
        );
      }
    }

    private render_student_info(students, num_deleted): Rendered {
      /* The "|| num_deleted > 0" below is because we show
      header even if no non-deleted students if there are deleted
      students, since it's important to show the link to show
      deleted students if there are any. */
      return (
        <div className="smc-vfill">
          {students.length > 0 || num_deleted > 0
            ? this.render_student_table_header(num_deleted)
            : undefined}
          {this.render_students(students)}
        </div>
      );
    }

    render() {
      const { students, num_omitted, num_deleted } = this.get_student_list();

      return (
        <div className="smc-vfill" style={{ margin: "0" }}>
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

function noncloud_emails(v, s) {
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
}
