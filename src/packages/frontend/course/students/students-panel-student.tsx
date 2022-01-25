/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// CoCalc libraries
import * as misc from "@cocalc/util/misc";
import { is_different } from "@cocalc/util/misc";
import { Card, Col, Input, Row } from "antd";
import React, { useEffect, useState } from "react";
import { DebounceInput } from "react-debounce-input";
import {
  Button,
  ButtonGroup,
  FormControl,
  FormGroup,
  Well,
} from "../../antd-bootstrap";
// React libraries and components
import { Rendered } from "../../app-framework";
import { Icon, MarkdownInput, Space, TimeAgo, Tip } from "../../components";
import { ProjectMap, UserMap } from "../../todo-types";
// CoCalc components
import { User } from "../../users";
import { webapp_client } from "../../webapp-client";
import { CourseActions } from "../actions";
import { StudentAssignmentInfo, StudentAssignmentInfoHeader } from "../common";
import {
  AssignmentsMap,
  IsGradingMap,
  NBgraderRunInfo,
  StudentRecord,
} from "../store";
import * as styles from "../styles";
import * as util from "../util";

export interface StudentNameDescription {
  full: string;
  first: string;
  last: string;
}

import { RESEND_INVITE_BEFORE } from "../student-projects/actions";
import { Button as AntdButton, Tooltip } from "antd";

/*
 Updates based on:
  - Expanded/Collapsed
  - If collapsed: First name, last name, email, last active, hosting type
  - If expanded: Above +, Student's status on all assignments,

*/
interface StudentProps {
  redux: any;
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
  nbgrader_run_info?: NBgraderRunInfo;
}

function isSameStudent(props, next) {
  if (props == null || next == null) return false;
  return !(
    is_different(props, next, [
      "name",
      "student",
      "user_map",
      "project_map",
      //"assignments",
      "background",
      "is_expanded",
      "active_feedback_edits",
      "nbgrader_run_info",
    ]) ||
    (props.student_name != null ? props.student_name.full : undefined) !==
      (next.student_name != null ? next.student_name.full : undefined)
  );
}

export const Student: React.FC<StudentProps> = React.memo(
  (props: StudentProps) => {
    const {
      redux,
      name,
      student,
      student_id,
      user_map,
      project_map,
      //assignments,
      background,
      is_expanded,
      student_name,
      display_account_name,
      active_feedback_edits,
      nbgrader_run_info,
    } = props;

    const actions: CourseActions = redux.getActions(name);
    const store = actions.get_store();
    if (store == null) throw Error("store must be defined");

    const hasAccount = student.get("account_id") != null;

    const [confirm_delete, set_confirm_delete] = useState<boolean>(false);
    const [editing_student, set_editing_student] = useState<boolean>(false);
    const [edited_first_name, set_edited_first_name] = useState<string>(
      student_name.first || ""
    );
    const [edited_last_name, set_edited_last_name] = useState<string>(
      student_name.last || ""
    );
    const [edited_email_address, set_edited_email_address] = useState<string>(
      student.get("email_address") || ""
    );
    const [more, set_more] = useState<boolean>(false);
    const [assignment_search, set_assignment_search] = useState<string>("");

    function reset_initial_state() {
      set_confirm_delete(false);
      set_editing_student(false);
      set_edited_first_name(student_name.first || "");
      set_edited_last_name(student_name.last || "");
      set_edited_email_address(student.get("email_address") || "");
      set_more(false);
      set_assignment_search("");
    }

    useEffect(() => {
      set_edited_first_name(student_name.first);
    }, [student_name.first]);
    useEffect(() => {
      set_edited_last_name(student_name.last);
    }, [student_name.last]);
    useEffect(() => {
      set_edited_email_address(student.get("email_address"));
    }, [props.student.get("email_address")]);

    function on_key_down(e) {
      switch (e.keyCode) {
        case 13:
          return save_student_changes();
        case 27:
          return cancel_student_edit();
      }
    }

    function toggle_show_more(e) {
      e.preventDefault();
      if (editing_student) {
        cancel_student_edit();
      }
      const item_id = student.get("student_id");
      actions.toggle_item_expansion("student", item_id);
    }

    function render_student() {
      return (
        <a href="" onClick={toggle_show_more}>
          <div style={{ width: "20px", display: "inline-block" }}>
            <Icon
              style={{ marginRight: "10px" }}
              name={is_expanded ? "caret-down" : "caret-right"}
            />
          </div>
          {render_student_name()}
        </a>
      );
    }

    function render_student_name() {
      const account_id = student.get("account_id");
      if (account_id != null) {
        return (
          <User
            account_id={account_id}
            user_map={user_map}
            name={student_name.full}
            show_original={display_account_name}
          />
        );
      }
      const name = store.get_student_name(student.get("student_id"));
      return <span>{name} (invited)</span>;
    }

    function render_student_email() {
      const email = student.get("email_address");
      return (
        <a target={"_blank"} href={`mailto:${email}`} rel={"noopener"}>
          {email}
        </a>
      );
    }

    function open_project() {
      redux.getActions("projects").open_project({
        project_id: student.get("project_id"),
      });
    }

    function create_project() {
      actions.student_projects.create_student_project(student_id);
    }

    function render_last_active() {
      if (hasAccount) {
        return (
          <span style={{ color: "#666" }}>(has not created account yet)</span>
        );
      }
      const student_project_id = student.get("project_id");
      if (student_project_id == null) {
        return;
      }
      const p = project_map.get(student_project_id);
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
      const last_active = u != null ? u.get(student.get("account_id")) : null;
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

    function render_hosting() {
      const { description, tip, state, icon } = util.projectStatus(
        student.get("project_id"),
        redux
      );
      return (
        <Tip
          placement="left"
          title={
            <span>
              <Icon name={icon} /> {description}
            </span>
          }
          tip={tip}
        >
          <span style={{ color: "#888", cursor: "pointer" }}>
            <Icon name={icon} /> {description}
            {state}
          </span>
        </Tip>
      );
    }

    function render_project_access(): JSX.Element {
      // first check if the project is currently being created
      const create = student.get("create_project");
      if (create != null) {
        // if so, how long ago did it start
        const how_long = (webapp_client.server_time() - create) / 1000;
        if (how_long < 120) {
          // less than 2 minutes -- still hope, so render that creating
          return (
            <div>
              <Icon name="cocalc-ring" spin /> Creating project... (started{" "}
              <TimeAgo date={create} />)
            </div>
          );
        }
      }
      // otherwise, maybe user killed file before finished or something and
      // it is lost; give them the chance
      // to attempt creation again by clicking the create button.
      const student_project_id = student.get("project_id");
      if (student_project_id != null) {
        return (
          <Button onClick={open_project}>
            <Tip
              placement="right"
              title="Student project"
              tip="Open the course project for this student."
            >
              <Icon name="edit" /> Open student project
            </Tip>
          </Button>
        );
      } else {
        return (
          <Tip
            placement="right"
            title="Create the student project"
            tip="Create a new project for this student, then add the student as a collaborator, and also add any collaborators on the project containing this course."
          >
            <Button onClick={create_project}>
              <Icon name="plus-circle" /> Create student project
            </Button>
          </Tip>
        );
      }
    }

    function student_changed() {
      return (
        props.student_name.first !== edited_first_name ||
        props.student_name.last !== edited_last_name ||
        props.student.get("email_address") !== edited_email_address
      );
    }

    function render_edit_student() {
      if (editing_student) {
        const disable_save = !student_changed();
        return (
          <ButtonGroup>
            <Button onClick={cancel_student_edit}>Cancel</Button>
            <Button
              onClick={save_student_changes}
              bsStyle="success"
              disabled={disable_save}
            >
              <Icon name="save" /> Save
            </Button>
          </ButtonGroup>
        );
      } else {
        return (
          <Button onClick={show_edit_name_dialogue}>
            <Icon name="address-card" /> Edit student...
          </Button>
        );
      }
    }

    function render_search_assignment() {
      return (
        <DebounceInput
          style={{ width: "100%" }}
          debounceTimeout={500}
          element={Input as any}
          placeholder={"Find assignments..."}
          value={assignment_search}
          onChange={(e) => set_assignment_search(e.target.value)}
        />
      );
    }

    function cancel_student_edit() {
      reset_initial_state();
    }

    function save_student_changes() {
      actions.students.set_internal_student_info(student.get("student_id"), {
        first_name: edited_first_name,
        last_name: edited_last_name,
        email_address: edited_email_address,
      });

      set_editing_student(false);
    }

    function show_edit_name_dialogue() {
      set_editing_student(true);
    }

    function delete_student() {
      actions.students.delete_student(student.get("student_id"));
      set_confirm_delete(false);
    }

    function undelete_student() {
      actions.students.undelete_student(student.get("student_id"));
    }

    function render_confirm_delete() {
      if (confirm_delete) {
        return (
          <div>
            Are you sure you want to delete this student?
            <Space />
            <ButtonGroup>
              <Button onClick={delete_student} bsStyle="danger">
                <Icon name="trash" /> YES, Delete
              </Button>
              <Button onClick={() => set_confirm_delete(false)}>Cancel</Button>
            </ButtonGroup>
          </div>
        );
      }
    }

    function render_delete_button() {
      if (!is_expanded) {
        return;
      }
      if (confirm_delete) {
        return render_confirm_delete();
      }
      if (student.get("deleted")) {
        return (
          <Button onClick={undelete_student}>
            <Icon name="trash" /> Undelete
          </Button>
        );
      } else {
        return (
          <Button onClick={() => set_confirm_delete(true)}>
            <Icon name="trash" /> Delete...
          </Button>
        );
      }
    }

    function render_resend_invitation() {
      // don't invite student if there is already an account
      if (hasAccount) return;
      const last_email_invite = student.get("last_email_invite");
      const allowResending =
        !last_email_invite ||
        new Date(last_email_invite) < RESEND_INVITE_BEFORE;

      const msg = allowResending ? "Resend invitation" : "Recently invited";
      const when =
        last_email_invite != null
          ? `Last invitation sent on ${new Date(
              last_email_invite
            ).toLocaleString()}`
          : "never";

      return (
        <Tooltip placement="bottom" title={when}>
          <AntdButton
            onClick={() =>
              actions.student_projects.invite_student_to_project({
                student: student.get("email_address"), // we use email address to trigger sending an actual email!
                student_project_id: student.get("project_id"),
                student_id: student.get("student_id"),
              })
            }
            disabled={!allowResending}
          >
            <Icon name="mail" /> {msg}
          </AntdButton>
        </Tooltip>
      );
    }

    function render_title_due(assignment) {
      const date = assignment.get("due_date");
      if (date) {
        return (
          <span>
            (Due <TimeAgo date={date} />)
          </span>
        );
      }
    }

    function render_title(assignment) {
      return (
        <span>
          <em>{misc.trunc_middle(assignment.get("path"), 50)}</em>{" "}
          {render_title_due(assignment)}
        </span>
      );
    }

    function render_assignments_info_rows() {
      const result: any[] = [];
      const terms = misc.search_split(assignment_search);
      for (const assignment of store.get_sorted_assignments()) {
        if (terms.length > 0) {
          if (
            !misc.search_match(
              assignment.get("path")?.toLowerCase() ?? "",
              terms
            )
          ) {
            continue;
          }
        }
        const grade = store.get_grade(
          assignment.get("assignment_id"),
          student.get("student_id")
        );
        const comments = store.get_comments(
          assignment.get("assignment_id"),
          student.get("student_id")
        );
        const info = store.student_assignment_info(
          student.get("student_id"),
          assignment.get("assignment_id")
        );
        const key = util.assignment_identifier(
          assignment.get("assignment_id"),
          student.get("student_id")
        );
        const edited_feedback = active_feedback_edits.get(key);
        result.push(
          <StudentAssignmentInfo
            key={assignment.get("assignment_id")}
            title={render_title(assignment)}
            name={name}
            student={student}
            assignment={assignment}
            grade={grade}
            comments={comments}
            nbgrader_scores={store.get_nbgrader_scores(
              assignment.get("assignment_id"),
              student.get("student_id")
            )}
            info={info}
            is_editing={!!edited_feedback}
            nbgrader_run_info={nbgrader_run_info}
          />
        );
      }
      return result;
    }

    function render_assignments_info() {
      const peer_grade = store.any_assignment_uses_peer_grading();
      const header = (
        <StudentAssignmentInfoHeader
          key="header"
          title="Assignment"
          peer_grade={peer_grade}
        />
      );
      return [header, render_assignments_info_rows()];
    }

    function render_note() {
      return (
        <Row key="note" style={styles.note}>
          <Col xs={4}>
            <Tip
              title="Notes about this student"
              tip="Record notes about this student here. These notes are only visible to you, not to the student.  In particular, you might want to include an email address or other identifying information here, and notes about late assignments, excuses, etc."
            >
              Private Student Notes
            </Tip>
          </Col>
          <Col xs={20}>
            <MarkdownInput
              persist_id={student.get("student_id") + "note"}
              attach_to={name}
              rows={6}
              placeholder="Notes about student (not visible to student)"
              default_value={student.get("note")}
              on_save={(value) =>
                actions.students.set_student_note(
                  student.get("student_id"),
                  value
                )
              }
            />
          </Col>
        </Row>
      );
    }

    function render_more_info() {
      // Info for each assignment about the student.
      const v: any[] = [];
      v.push(
        <Row key="more">
          <Col md={24}>{render_assignments_info()}</Col>
        </Row>
      );
      v.push(render_note());
      v.push(render_push_missing_handouts_and_assignments());
      return v;
    }

    function render_basic_info() {
      return (
        <Row key="basic" style={{ backgroundColor: background }}>
          <Col md={6}>
            <h6>
              {render_student()}
              {render_deleted()}
            </h6>
          </Col>
          <Col md={4}>
            <h6 style={{ color: "#666" }}>{render_student_email()}</h6>
          </Col>
          <Col md={8} style={{ paddingTop: "10px" }}>
            {render_last_active()}
          </Col>
          <Col md={6} style={{ paddingTop: "10px" }}>
            {render_hosting()}
          </Col>
        </Row>
      );
    }

    function render_push_missing_handouts_and_assignments(): Rendered {
      return (
        <Row key="catchup" style={{ marginTop: "15px" }}>
          <Col xs={4}>
            <Tip
              title="Catch up this student"
              tip="Copy any assignments and handouts to this student that have been copied to at least one other student"
            >
              Copy missing assignments and handouts
            </Tip>
          </Col>
          <Col xs={8}>
            <Button
              onClick={() =>
                actions.students.push_missing_handouts_and_assignments(
                  student.get("student_id")
                )
              }
            >
              <Icon name="share-square" /> Catch up this student
            </Button>
          </Col>
        </Row>
      );
    }

    function render_deleted() {
      if (student.get("deleted")) {
        return <b> (deleted)</b>;
      }
    }

    function render_panel_header() {
      // The whiteSpace normal is because the title of an
      // antd Card doesn't wrap, and I don't want to restructure
      // this whole student delete code right now to not put
      // confirmation in the title.  When it is restructured
      // it'll be the antd modal popup anyways...
      // See https://github.com/sagemathinc/cocalc/issues/4286
      return (
        <div style={{ whiteSpace: "normal" }}>
          <Row>
            <Col md={4}>{render_project_access()}</Col>
            <Col md={4}>{render_edit_student()}</Col>
            <Col md={4}>{render_search_assignment()}</Col>
            <Col md={2} offset={3}>
              {render_resend_invitation()}
            </Col>
            <Col md={4} offset={3}>
              {render_delete_button()}
            </Col>
          </Row>
          {editing_student ? (
            <Row>
              <Col md={8}>{render_edit_student_interface()}</Col>
            </Row>
          ) : undefined}
        </div>
      );
    }

    function render_edit_student_interface() {
      return (
        <Well style={{ marginTop: "10px" }}>
          <Row>
            <Col md={12} style={{ paddingRight: "15px" }}>
              First Name
              <FormGroup>
                <FormControl
                  type="text"
                  autoFocus={true}
                  value={edited_first_name}
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                  }}
                  onChange={(e) =>
                    set_edited_first_name((e.target as any).value)
                  }
                  onKeyDown={on_key_down}
                />
              </FormGroup>
            </Col>
            <Col md={12}>
              Last Name
              <FormGroup>
                <FormControl
                  type="text"
                  value={edited_last_name}
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                  }}
                  onChange={(e) =>
                    set_edited_last_name((e.target as any).value)
                  }
                  onKeyDown={on_key_down}
                />
              </FormGroup>
            </Col>
          </Row>
          <Row>
            <Col md={24}>
              Email Address
              <FormGroup>
                <FormControl
                  type="text"
                  value={edited_email_address}
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                  }}
                  onChange={(e) =>
                    set_edited_email_address((e.target as any).value)
                  }
                  onKeyDown={on_key_down}
                />
              </FormGroup>
            </Col>
          </Row>
        </Well>
      );
    }

    function render_more_panel() {
      return (
        <Row>
          <Col xs={24}>
            <Card title={render_panel_header()}>{render_more_info()}</Card>
          </Col>
        </Row>
      );
    }

    return (
      <div>
        <Row style={more ? styles.selected_entry : undefined}>
          <Col xs={24}>
            {render_basic_info()}
            {is_expanded ? render_more_panel() : undefined}
          </Col>
        </Row>
      </div>
    );
  },
  isSameStudent
);
