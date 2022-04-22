/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import {
  AppRedux,
  React,
  Rendered,
  useActions,
  useEffect,
  useIsMountedRef,
  useRedux,
  useRef,
  useState,
} from "@cocalc/frontend/app-framework";
import {
  ErrorDisplay,
  Icon,
  SearchInput,
  Space,
  Tip,
} from "@cocalc/frontend/components";
import ScrollableList from "@cocalc/frontend/components/scrollable-list";
import { ProjectMap, UserMap } from "@cocalc/frontend/todo-types";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import * as misc from "@cocalc/util/misc";
import { is_different, search_match, search_split } from "@cocalc/util/misc";
import { Alert, Button, Col, Form, Input, Row } from "antd";
import { Set } from "immutable";
import { concat, isEqual, keys, sortBy } from "lodash";
import { CourseActions } from "../actions";
import {
  AssignmentsMap,
  IsGradingMap,
  NBgraderRunInfo,
  SortDescription,
  StudentRecord,
  StudentsMap,
} from "../store";
import * as util from "../util";
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

interface StudentList {
  students: any[];
  num_omitted: number;
  num_deleted: number;
}

function isSame(prev, next) {
  return !is_different(prev, next, [
    "name",
    "project_id",
    "assignments",
    "students",
    "frame_id",
    "user_map", // be careful, this could change quite often. below is a "useEffect" to mitigate frequent updates.
  ]);
}

export const StudentsPanel: React.FC<StudentsPanelReactProps> = React.memo(
  (props: StudentsPanelReactProps) => {
    const {
      frame_id,
      name,
      redux,
      project_id,
      students,
      user_map,
      project_map,
      assignments,
    } = props;

    const addSelectRef = useRef<HTMLSelectElement>(null);
    const studentAddInputRef = useRef(null);

    const actions = useActions<CourseActions>({ name });

    const expanded_students: Set<string> | undefined = useRedux(
      name,
      "expanded_students"
    );
    const active_student_sort: SortDescription | undefined = useRedux(
      name,
      "active_student_sort"
    );
    const active_feedback_edits: IsGradingMap = useRedux(
      name,
      "active_feedback_edits"
    );
    const nbgrader_run_info: NBgraderRunInfo | undefined = useRedux(
      name,
      "nbgrader_run_info"
    );

    const isMounted = useIsMountedRef();

    const [err, set_err] = useState<string | undefined>(undefined);
    const [search, set_search] = useState<string>("");
    const [add_search, set_add_search] = useState<string>("");
    const [add_searching, set_add_searching] = useState<boolean>(false);
    const [add_select, set_add_select] = useState<any>(undefined);
    const [existing_students, set_existing_students] = useState<
      any | undefined
    >(undefined);
    const [selected_option_nodes, set_selected_option_nodes] = useState<
      any | undefined
    >(undefined);
    // the type is copy/paste from what TS infers in the util.parse_students function
    const [students_unordered, set_students_unordered] = useState<
      {
        create_project: number;
        account_id: string;
        student_id: string;
        first_name: string;
        last_name: string;
        last_active: number;
        hosting: string;
        email_address: string;
        project_id: string;
        deleted: boolean;
        note: string;
        last_email_invite: number;
      }[]
    >([]);
    const [selected_option_num, set_selected_option_num] = useState<number>(0);
    const [show_deleted, set_show_deleted] = useState<boolean>(false);
    const [studentInputFocused, setStudentInputFocused] =
      useState<boolean>(false);

    useEffect(() => {
      set_selected_option_num(selected_option_nodes?.length ?? 0);
    }, [selected_option_nodes]);

    // this updates a JS list from the ever changing user_map immutableMap
    React.useEffect(() => {
      const v = util.parse_students(students, user_map, redux);
      if (!isEqual(v, students_unordered)) {
        set_students_unordered(v);
      }
    }, [students, user_map]);

    // student_list not a list, but has one, plus some extra info.
    const student_list: StudentList = React.useMemo(() => {
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

      const students_ordered = [...students_unordered];

      if (active_student_sort != null) {
        students_ordered.sort(
          util.pick_student_sorter(active_student_sort.toJS())
        );
        if (active_student_sort.get("is_descending")) {
          students_ordered.reverse();
        }
      }

      // Deleted and non-deleted students
      const deleted: any[] = [];
      const non_deleted: any[] = [];
      for (const x of students_ordered) {
        if (x.deleted) {
          deleted.push(x);
        } else {
          non_deleted.push(x);
        }
      }
      const num_deleted = deleted.length;

      const students_shown = show_deleted
        ? non_deleted.concat(deleted) // show deleted ones at the end...
        : non_deleted;

      let num_omitted = 0;
      const students_next = (function () {
        if (search) {
          const words = search_split(search.toLowerCase());
          const students_filtered: any[] = [];
          for (const x of students_shown) {
            const target = [
              x.first_name ?? "",
              x.last_name ?? "",
              x.email_address ?? "",
            ]
              .join(" ")
              .toLowerCase();
            if (search_match(target, words)) {
              students_filtered.push(x);
            } else {
              num_omitted += 1;
            }
          }
          return students_filtered;
        } else {
          return students_shown;
        }
      })();

      return { students: students_next, num_omitted, num_deleted };
    }, [
      students,
      students_unordered,
      show_deleted,
      search,
      active_student_sort,
    ]);

    async function do_add_search(e): Promise<void> {
      // Search for people to add to the course
      if (e != null) {
        e.preventDefault();
      }
      if (students == null) return;
      // already searching
      if (add_searching) return;
      const search = add_search.trim();
      if (search.length === 0) {
        set_err(undefined);
        set_add_select(undefined);
        set_existing_students(undefined);
        set_selected_option_nodes(undefined);
        return;
      }
      set_add_searching(true);
      set_add_select(undefined);
      set_existing_students(undefined);
      set_selected_option_nodes(undefined);
      let select;
      try {
        select = await webapp_client.users_client.user_search({
          query: add_search,
          limit: 150,
        });
      } catch (err) {
        if (!isMounted) return;
        set_add_searching(false);
        set_err(err);
        set_add_select(undefined);
        set_existing_students(undefined);
        return;
      }
      if (!isMounted) return;

      // Get the current collaborators/owners of the project that
      // contains the course.
      const users = redux.getStore("projects").get_users(project_id);
      // Make a map with keys the email or account_id is already part of the course.
      const already_added = users?.toJS() ?? {}; // start with collabs on project
      // also track **which** students are already part of the course
      const existing_students: any = {};
      existing_students.account = {};
      existing_students.email = {};
      // For each student in course add account_id and/or email_address:
      students.map((val) => {
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
      const select2 = select.filter(
        (x) => !exclude_add(x.account_id, x.email_address)
      );
      // Put at the front of the list any email addresses not known to CoCalc (sorted in order) and also not invited to course.
      // NOTE (see comment on https://github.com/sagemathinc/cocalc/issues/677): it is very important to pass in
      // the original select list to nonclude_emails below, **NOT** select2 above.  Otherwise, we end up
      // bringing back everything in the search, which is a bug.
      const unknown = noncloud_emails(select, add_search).filter(
        (x) => !exclude_add(null, x.email_address)
      );
      const select3 = concat(unknown, select2);
      // We are no longer searching, but now show an options selector.
      set_add_searching(false);
      set_add_select(select3);
      set_existing_students(existing_students);
    }

    function student_add_button() {
      const disabled = add_search?.trim().length === 0;
      const icon = add_searching ? (
        <Icon name="cocalc-ring" spin />
      ) : (
        <Icon name="search" />
      );

      return (
        <Button onClick={do_add_search} icon={icon} disabled={disabled}>
          Search (shift+enter)
        </Button>
      );
    }

    function add_selector_changed(e): void {
      const opts = e.target.selectedOptions;
      // It's important to make a shallow copy, because somehow this array is modified in-place
      // and hence this call to set the array doesn't register a change (e.g. selected_option_num stays in sync)
      set_selected_option_nodes([...opts]);
    }

    function add_selected_students(options) {
      const emails = {};
      for (const x of add_select) {
        if (x.account_id != null) {
          emails[x.account_id] = x.email_address;
        }
      }
      const students: any[] = [];
      const selections: any[] = [];

      // first check, if no student is selected and there is just one in the list
      if (
        (selected_option_nodes == null ||
          selected_option_nodes?.length === 0) &&
        options?.length === 1
      ) {
        selections.push(options[0].key);
      } else {
        for (const option of selected_option_nodes) {
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
      actions.students.add_students(students);
      clear();
    }

    function add_all_students() {
      const students: any[] = [];
      for (const entry of add_select) {
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
      actions.students.add_students(students);
      clear();
    }

    function clear(): void {
      set_err(undefined);
      set_add_select(undefined);
      set_selected_option_nodes(undefined);
      set_add_search("");
      set_existing_students(undefined);
    }

    function get_add_selector_options() {
      const v: any[] = [];
      const seen = {};
      for (const x of add_select) {
        const key = x.account_id != null ? x.account_id : x.email_address;
        if (seen[key]) continue;
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

    function render_add_selector() {
      if (add_select == null) return;
      const options = get_add_selector_options();
      return (
        <>
          <Form.Item style={{ margin: "5px 0 15px 0" }}>
            <select
              style={{ width: "100%", border: "1px solid lightgray" }}
              multiple
              ref={addSelectRef}
              size={8}
              onChange={add_selector_changed}
            >
              {options}
            </select>
          </Form.Item>
          <Form.Item>
            {render_cancel()}
            <Space />
            {render_add_selector_button(options)}
            <Space />
            {render_add_all_students_button(options)}
          </Form.Item>
        </>
      );
    }

    function get_add_selector_button_text(existing) {
      switch (selected_option_num) {
        case 0:
          if (existing) {
            return "Student already added";
          } else {
            return "Select student(s)";
          }
        case 1:
          return "Add student";
        default:
          switch (selected_option_num) {
            case 0:
              return "Select student above";
            case 1:
              return "Add selected student";
            default:
              return `Add ${selected_option_num} students`;
          }
      }
    }

    function render_add_selector_button(options) {
      let existing;
      const es = existing_students;
      if (es != null) {
        existing = keys(es.email).length + keys(es.account).length > 0;
      } else {
        // es not defined when user clicks the close button on the warning.
        existing = 0;
      }
      const btn_text = get_add_selector_button_text(existing);
      const disabled =
        options.length === 0 ||
        (options.length >= 1 && selected_option_num === 0);
      return (
        <Button
          onClick={() => add_selected_students(options)}
          disabled={disabled}
        >
          <Icon name="user-plus" /> {btn_text}
        </Button>
      );
    }

    function render_add_all_students_button(options) {
      return (
        <Button
          onClick={() => add_all_students()}
          disabled={options.length === 0}
        >
          <Icon name={"user-plus"} /> Add all students
        </Button>
      );
    }

    function render_cancel(): Rendered {
      return <Button onClick={() => clear()}>Cancel</Button>;
    }

    function render_error_display() {
      if (err) {
        return (
          <ErrorDisplay
            error={misc.trunc(err, 1024)}
            onClose={() => set_err(undefined)}
          />
        );
      } else if (existing_students != null) {
        const existing: any[] = [];
        for (const email in existing_students.email) {
          existing.push(email);
        }
        for (const account_id in existing_students.account) {
          const user = user_map.get(account_id);
          existing.push(`${user.get("first_name")} ${user.get("last_name")}`);
        }
        if (existing.length > 0) {
          const existingStr = existing.join(", ");
          const msg = `Already added (or deleted) students or project collaborators: ${existingStr}`;
          return (
            <ErrorDisplay
              bsStyle="info"
              error={msg}
              onClose={() => set_existing_students(undefined)}
            />
          );
        }
      }
    }

    function render_error() {
      const ed = render_error_display();
      if (ed != null) {
        return (
          <Col md={24} style={{ marginBottom: "20px" }}>
            {ed}
          </Col>
        );
      }
    }

    function student_add_input_onChange() {
      const value =
        (studentAddInputRef?.current as any).resizableTextArea?.textArea
          .value ?? "";
      set_add_select(undefined);
      set_add_search(value);
    }

    function student_add_input_onKeyDown(e) {
      // ESC key
      if (e.keyCode === 27) {
        set_add_search("");
        set_add_select(undefined);

        // Shift+Return
      } else if (e.keyCode === 13 && e.shiftKey) {
        e.preventDefault();
        student_add_input_onChange();
        do_add_search(e);
      }
    }

    function render_header(num_omitted) {
      // TODO: get rid of all of the bootstrap form crap below.  I'm basically
      // using inline styles to undo the spacing screwups they cause, so it doesn't
      // look like total crap.

      const rows =
        add_search.trim().length == 0 && !studentInputFocused ? 1 : 4;

      return (
        <div>
          <Row>
            <Col md={6}>
              <SearchInput
                placeholder="Find students..."
                default_value={search}
                on_change={(value) => set_search(value)}
              />
            </Col>
            <Col md={6}>
              {num_omitted ? (
                <h5>(Omitting {num_omitted} students)</h5>
              ) : undefined}
            </Col>
            <Col md={11}>
              <Form onFinish={do_add_search} style={{ marginLeft: "15px" }}>
                <Row>
                  <Col md={18}>
                    <Form.Item style={{ margin: "0 0 5px 0" }}>
                      <Input.TextArea
                        ref={studentAddInputRef}
                        placeholder="Add students by name or email address..."
                        value={add_search}
                        rows={rows}
                        onChange={() => student_add_input_onChange()}
                        onKeyDown={(e) => student_add_input_onKeyDown(e)}
                        onFocus={() => setStudentInputFocused(true)}
                        onBlur={() => setStudentInputFocused(false)}
                      />
                    </Form.Item>
                  </Col>
                  <Col md={6}>
                    <div style={{ marginLeft: "15px", width: "100%" }}>
                      {student_add_button()}
                    </div>
                  </Col>
                  <Col md={24}>{render_add_selector()}</Col>
                  {render_error()}
                </Row>
              </Form>
            </Col>
          </Row>
        </div>
      );
    }

    function render_sort_icon(column_name: string): Rendered {
      if (
        active_student_sort == null ||
        active_student_sort.get("column_name") != column_name
      )
        return;
      return (
        <Icon
          style={{ marginRight: "10px" }}
          name={
            active_student_sort.get("is_descending") ? "caret-up" : "caret-down"
          }
        />
      );
    }

    function render_sort_link(
      column_name: string,
      display_name: string
    ): Rendered {
      return (
        <a
          href=""
          onClick={(e) => {
            e.preventDefault();
            actions.students.set_active_student_sort(column_name);
          }}
        >
          {display_name}
          <Space />
          {render_sort_icon(column_name)}
        </a>
      );
    }

    function render_student_table_header(num_deleted: number): Rendered {
      // HACK: that marginRight is to get things to line up with students.
      return (
        <div>
          <Row style={{ marginRight: 0 }}>
            <Col md={6}>
              <div style={{ display: "inline-block", width: "50%" }}>
                {render_sort_link("first_name", "First Name")}
              </div>
              <div style={{ display: "inline-block" }}>
                {render_sort_link("last_name", "Last Name")}
              </div>
            </Col>
            <Col md={4}>{render_sort_link("email", "Email Address")}</Col>
            <Col md={8}>{render_sort_link("last_active", "Last Active")}</Col>
            <Col md={3}>{render_sort_link("hosting", "Project Status")}</Col>
            <Col md={3}>
              {num_deleted ? render_show_deleted(num_deleted) : undefined}
            </Col>
          </Row>
        </div>
      );
    }

    function get_student(id: string): StudentRecord {
      const student = students.get(id);
      if (student == undefined) {
        console.warn(`Tried to access undefined student ${id}`);
      }
      return student as any;
    }

    function render_student(student_id: string, index: number) {
      const x = student_list.students[index];
      if (x == null) return null;
      const store = actions.get_store();
      if (store == null) return null;
      const studentName: StudentNameDescription = {
        full: store.get_student_name(x.student_id),
        first: x.first_name,
        last: x.last_name,
      };
      return (
        <Student
          background={index % 2 === 0 ? "#eee" : undefined}
          key={student_id}
          student_id={student_id}
          student={get_student(student_id)}
          user_map={user_map}
          redux={redux}
          name={name}
          project_map={project_map}
          assignments={assignments}
          is_expanded={expanded_students?.has(student_id) ?? false}
          student_name={studentName}
          display_account_name={true}
          active_feedback_edits={active_feedback_edits}
          nbgrader_run_info={nbgrader_run_info}
        />
      );
    }

    function render_students(students): Rendered {
      if (students.length == 0) {
        return render_no_students();
      }
      return (
        <ScrollableList
          rowCount={students.length}
          rowRenderer={({ key, index }) => render_student(key, index)}
          rowKey={(index) =>
            students[index] != null ? students[index].student_id : undefined
          }
          cacheId={`course-student-${name}-${frame_id}`}
        />
      );
    }

    function render_no_students(): Rendered {
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

    function render_show_deleted(num_deleted) {
      if (show_deleted) {
        return (
          <a onClick={() => set_show_deleted(false)}>
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
          <a
            onClick={() => {
              set_show_deleted(true);
              set_search("");
            }}
          >
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

    function render_student_info(students, num_deleted): Rendered {
      /* The "|| num_deleted > 0" below is because we show
      header even if no non-deleted students if there are deleted
      students, since it's important to show the link to show
      deleted students if there are any. */
      return (
        <div className="smc-vfill">
          {students.length > 0 || num_deleted > 0
            ? render_student_table_header(num_deleted)
            : undefined}
          {render_students(students)}
        </div>
      );
    }

    {
      const { students, num_omitted, num_deleted } = student_list;
      return (
        <div className="smc-vfill" style={{ margin: "0" }}>
          {render_header(num_omitted)}
          {render_student_info(students, num_deleted)}
        </div>
      );
    }
  },
  isSame
);

// Given a list v of user_search results, and a search string s,
// return entries for each email address not in v, in order.
function noncloud_emails(v, s) {
  const { email_queries } = misc.parse_user_search(s);

  const result_emails = misc.dict(
    v.filter((r) => r.email_address != null).map((r) => [r.email_address, true])
  );

  return sortBy(
    email_queries
      .filter((r) => !result_emails[r])
      .map((r) => {
        return { email_address: r };
      }),
    "email_address"
  );
}
