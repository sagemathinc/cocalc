/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import {
  Button,
  ButtonGroup,
  FormControl,
  FormGroup,
} from "@cocalc/frontend/antd-bootstrap";
import { AppRedux, React, Rendered } from "@cocalc/frontend/app-framework";
import {
  DateTimePicker,
  Icon,
  IconName,
  Loading,
  MarkdownInput,
  Tip,
} from "@cocalc/frontend/components";
//import { webapp_client } from "@cocalc/frontend/webapp-client";
import { capitalize, is_different, trunc_middle } from "@cocalc/util/misc";
import { Alert, Card, Col, Input, Row } from "antd";
import { ReactElement, useState } from "react";
import { DebounceInput } from "react-debounce-input";
import { CourseActions } from "../actions";
import { BigTime } from "../common";
import { Progress } from "../common/progress";
import { NbgraderButton } from "../nbgrader/nbgrader-button";
import {
  AssignmentRecord,
  CourseStore,
  IsGradingMap,
  NBgraderRunInfo,
  SortDescription,
} from "../store";
import * as styles from "../styles";
import { AssignmentCopyStep, AssignmentStatus } from "../types";
import { STEPS, step_direction, step_ready, step_verb } from "../util";
import { STUDENT_SUBDIR } from "./actions";
import { StudentListForAssignment } from "./assignment-student-list";
import { ConfigurePeerGrading } from "./configure-peer";
import { SkipCopy } from "./skip";

interface AssignmentProps {
  active_feedback_edits: IsGradingMap;
  active_student_sort: SortDescription;
  assignment: AssignmentRecord;
  background?: string;
  expand_peer_config?: boolean;
  frame_id?: string;
  is_expanded?: boolean;
  name: string;
  nbgrader_run_info?: NBgraderRunInfo;
  project_id: string;
  redux: AppRedux;
  students: object;
  user_map: object;
}

function isSame(prev, next): boolean {
  return !is_different(prev, next, [
    "active_feedback_edits",
    "active_student_sort",
    "assignment",
    "background",
    "expand_peer_config",
    "is_expanded",
    "nbgrader_run_info",
    "students",
    "user_map",
  ]);
}

function useCopyConfirmState() {
  const [copy_confirm, set_copy_confirm] = useState<{
    [state in AssignmentCopyStep]: boolean;
  }>({
    assignment: false,
    collect: false,
    peer_assignment: false,
    peer_collect: false,
    return_graded: false,
  });

  // we only modify, not replace
  function set(state: AssignmentCopyStep, value: boolean): void {
    set_copy_confirm((prev) => ({
      ...prev,
      [state]: value,
    }));
  }

  return { copy_confirm, set };
}

export const Assignment: React.FC<AssignmentProps> = React.memo(
  (props: AssignmentProps) => {
    const {
      active_feedback_edits,
      active_student_sort,
      assignment,
      background,
      expand_peer_config,
      frame_id,
      is_expanded,
      name,
      nbgrader_run_info,
      project_id,
      redux,
      students,
      user_map,
    } = props;

    const [confirm_delete, set_confirm_delete] = useState<boolean>(false);
    const [
      copy_assignment_confirm_overwrite,
      set_copy_assignment_confirm_overwrite,
    ] = useState<boolean>(false);
    const [
      copy_assignment_confirm_overwrite_text,
      set_copy_assignment_confirm_overwrite_text,
    ] = useState<string>("");
    const [student_search, set_student_search] = useState<string>("");
    const [copy_confirm, set_copy_confirm] = useState<boolean>(false);

    const { copy_confirm: copy_confirm_state, set: set_copy_confirm_state } =
      useCopyConfirmState();
    const { copy_confirm: copy_confirm_all, set: set_copy_confirm_all } =
      useCopyConfirmState();

    // const [copy_confirm_assignment, set_copy_confirm_assignment] =
    //   useState<boolean>(false);
    // const [copy_confirm_collect, set_copy_confirm_collect] =
    //   useState<boolean>(false);
    // const [copy_confirm_peer_assignment, set_copy_confirm_peer_assignment] =
    //   useState<boolean>(false);
    // const [copy_confirm_peer_collect, set_copy_confirm_peer_collect] =
    //   useState<boolean>(false);
    // const [copy_confirm_return_graded, set_copy_confirm_return_graded] =
    //   useState<boolean>(false);

    function get_actions(): CourseActions {
      return redux.getActions(name);
    }

    function get_store(): CourseStore {
      return redux.getStore(name) as any;
    }

    function is_peer_graded() {
      return !!assignment.getIn(["peer_grade", "enabled"]);
    }

    // TODO: this was part of the code before converting to React.FC. This was never used, but it looks like it belongs here.
    // function _due_date() {
    //   const due_date = assignment.get("due_date"); // a string
    //   if (due_date == null) {
    //     return webapp_client.server_time();
    //   } else {
    //     return new Date(due_date);
    //   }
    // }

    function render_due() {
      return (
        <Row>
          <Col xs={2} style={{ marginTop: "8px", color: "#666" }}>
            <Tip
              placement="top"
              title="Set the due date"
              tip="Set the due date for the assignment.  This changes how the list of assignments is sorted.  Note that you must explicitly click a button to collect student assignments when they are due -- they are not automatically collected on the due date.  You should also tell students when assignments are due (e.g., at the top of the assignment)."
            >
              Due
            </Tip>
          </Col>
          <Col xs={22}>
            <DateTimePicker
              placeholder={"Set Due Date"}
              value={assignment.get("due_date")}
              onChange={date_change}
            />
          </Col>
        </Row>
      );
    }

    function date_change(date): void {
      get_actions().assignments.set_due_date(
        assignment.get("assignment_id"),
        date != null ? date.toISOString() : undefined
      );
    }

    function render_note() {
      return (
        <Row key="note" style={styles.note}>
          <Col xs={4}>
            <Tip
              title="Notes about this assignment"
              tip="Record notes about this assignment here. These notes are only visible to you, not to your students.  Put any instructions to students about assignments in a file in the directory that contains the assignment."
            >
              Private Assignment Notes
              <br />
              <span style={{ color: "#666" }} />
            </Tip>
          </Col>
          <Col xs={20}>
            <MarkdownInput
              persist_id={
                assignment.get("path") +
                assignment.get("assignment_id") +
                "note"
              }
              attach_to={name}
              rows={6}
              placeholder="Private notes about this assignment (not visible to students)"
              default_value={assignment.get("note")}
              on_save={(value) =>
                get_actions().assignments.set_assignment_note(
                  assignment.get("assignment_id"),
                  value
                )
              }
            />
          </Col>
        </Row>
      );
    }

    function render_export_file_use_times(): Rendered {
      return (
        <Row key="file-use-times-export-used">
          <Col xs={4}>
            <Tip
              title="Export when students used files"
              tip="Export a JSON file containing extensive information about exactly when students have opened or edited files in this assignment.  The JSON file will open in a new tab; the access_times (in milliseconds since the UNIX epoch) are when they opened the file and the edit_times are when they actually changed it through CoCalc's web-based editor."
            >
              Export file use times
              <br />
              <span style={{ color: "#666" }} />
            </Tip>
          </Col>
          <Col xs={20}>
            <Button
              onClick={() =>
                get_actions().export.file_use_times(
                  assignment.get("assignment_id")
                )
              }
            >
              Export file use times for this assignment
            </Button>
          </Col>
        </Row>
      );
    }

    function render_export_assignment(): Rendered {
      return (
        <Row key="file-use-times-export-collected">
          <Col xs={4}>
            <Tip
              title="Export collected student files"
              tip="Export all student work to files in a single directory that are easy to grade or archive outside of CoCalc.  Any Jupyter notebooks or Sage worksheets are first converted to PDF (if possible), and all files are renamed with the student as a filename prefix."
            >
              Export collected student files
              <br />
              <span style={{ color: "#666" }} />
            </Tip>
          </Col>
          <Col xs={20}>
            <Button
              onClick={() =>
                get_actions().assignments.export_collected(
                  assignment.get("assignment_id")
                )
              }
            >
              Export collected student files to single directory, converting
              Jupyter notebooks to pdf and html for easy offline grading.
            </Button>
          </Col>
        </Row>
      );
    }

    function render_no_content() {
      return (
        <div
          style={{ margin: "15px auto", maxWidth: "800px", fontSize: "12pt" }}
        >
          There are no files in this assignment yet. Please{" "}
          <a onClick={open_assignment_path}>open the directory</a> for this
          assignment, then create, upload, or copy any content you want into
          that directory. You will then be able to send it to all of your
          students.
        </div>
      );
    }

    function render_more_header(num_files: number) {
      let width;
      const status: AssignmentStatus | undefined =
        get_store().get_assignment_status(assignment.get("assignment_id"));
      if (status == null) {
        return <Loading key="loading_more" />;
      }
      const v: ReactElement<any>[] = [];

      const bottom = {
        borderBottom: "1px solid grey",
        paddingBottom: "15px",
        marginBottom: "15px",
      };
      v.push(
        <Row key="header3" style={bottom}>
          <Col md={4}>{render_open_button()}</Col>
          <Col md={20}>
            <Row>
              <Col md={12} style={{ fontSize: "14px" }} key="due">
                {render_due()}
              </Col>
              <Col md={12} key="delete">
                <Row>
                  <Col md={14}>{render_peer_button()}</Col>
                  <Col md={10}>
                    <span className="pull-right">{render_delete_button()}</span>
                  </Col>
                </Row>
              </Col>
            </Row>
          </Col>
        </Row>
      );

      if (expand_peer_config) {
        v.push(
          <Row key="header2-peer" style={bottom}>
            <Col md={20} offset={4}>
              {render_configure_peer()}
            </Col>
          </Row>
        );
      }
      if (confirm_delete) {
        v.push(
          <Row key="header2-delete" style={bottom}>
            <Col md={20} offset={4}>
              {render_confirm_delete()}
            </Col>
          </Row>
        );
      }

      const peer = is_peer_graded();
      if (peer) {
        width = 4;
      } else {
        width = 6;
      }

      if (num_files > 0) {
        const buttons: ReactElement<any>[] = [];
        const insert_grade_button = (key: string) => {
          const b2 = render_skip_grading_button(status);
          return buttons.push(
            <Col md={width} key={key}>
              {render_nbgrader_button(status)}
              {b2}
            </Col>
          );
        };

        for (const name of STEPS(peer)) {
          const b = render_button(name, status);
          // squeeze in the skip grading button (don't add it to STEPS!)
          if (!peer && name === "return_graded") {
            insert_grade_button("skip_grading");
          }
          if (b != null) {
            buttons.push(
              <Col md={width} key={name}>
                {b}
              </Col>
            );
            if (peer && name === "peer_collect") {
              insert_grade_button("skip_peer_collect");
            }
          }
        }

        v.push(
          <Row key="header-control">
            <Col md={4} key="search" style={{ paddingRight: "15px" }}>
              <DebounceInput
                debounceTimeout={500}
                element={Input as any}
                placeholder={"Find students..."}
                value={student_search}
                onChange={(e) => set_student_search(e.target.value)}
              />
            </Col>
            <Col md={20} key="buttons">
              <Row>{buttons}</Row>
            </Col>
          </Row>
        );

        v.push(
          <Row key="header2-copy">
            <Col md={20} offset={4}>
              {render_copy_confirms(status)}
            </Col>
          </Row>
        );
      }
      /* The whiteSpace:'normal' here is because we put this in an
         antd Card title, which has line wrapping disabled. */
      return <div style={{ whiteSpace: "normal" }}>{v}</div>;
    }

    function render_more() {
      const num_files = assignment.get("listing")?.size ?? 0;
      let body;
      if (num_files == 0) {
        body = render_no_content();
      } else {
        body = (
          <>
            <StudentListForAssignment
              redux={redux}
              frame_id={frame_id}
              name={name}
              assignment={assignment}
              students={students}
              user_map={user_map}
              active_student_sort={active_student_sort}
              active_feedback_edits={active_feedback_edits}
              nbgrader_run_info={nbgrader_run_info}
              search={student_search}
            />
            {render_note()}
            <br />
            <hr />
            <br />
            {render_export_file_use_times()}
            <br />
            {render_export_assignment()}
          </>
        );
      }
      return (
        <Row key="more">
          <Col sm={24}>
            <Card title={render_more_header(num_files)}> {body}</Card>
          </Col>
        </Row>
      );
    }

    function open_assignment_path(): void {
      if (assignment.get("listing")?.size == 0) {
        // there are no files yet, so we *close* the assignment
        // details panel.  This is just **a hack** so that the user
        // has to re-open it after adding files, which will trigger
        // updating the directory listing, hence show the rest
        // of the assignment info.  The alternative would be
        // polling the directory or watching listings, which is
        // a lot more work to properly implement.
        get_actions().toggle_item_expansion(
          "assignment",
          assignment.get("assignment_id")
        );
      }
      return redux
        .getProjectActions(project_id)
        .open_directory(assignment.get("path"));
    }

    function render_open_button() {
      return (
        <Tip
          key="open"
          title={
            <span>
              <Icon name="folder-open" /> Open Directory
            </span>
          }
          tip="Open the directory in the current project that contains the original files for this assignment.  Edit files in this folder to create the content that your students will see when they receive an assignment."
        >
          <Button onClick={open_assignment_path}>
            <Icon name="folder-open" /> Open...
          </Button>
        </Tip>
      );
    }

    function show_copy_confirm(): void {
      set_copy_confirm_state("assignment", true);
      set_copy_confirm(true);
      const actions = get_actions();
      const assignment_id: string | undefined = assignment.get("assignment_id");
      actions.assignments.update_listing(assignment_id);
    }

    function render_assignment_button(status) {
      let bsStyle;
      const last_assignment = assignment.get("last_assignment");
      // Primary if it hasn't been assigned before or if it hasn't started assigning.
      if (
        !last_assignment ||
        !(last_assignment.get("time") || last_assignment.get("start"))
      ) {
        bsStyle = "primary";
      } else {
        bsStyle = "warning";
      }
      if (status.assignment > 0 && status.not_assignment === 0) {
        bsStyle = "success";
      }

      return [
        <Button
          key="assign"
          bsStyle={bsStyle}
          onClick={show_copy_confirm}
          disabled={copy_confirm}
        >
          <Tip
            title={
              <span>
                Assign: <Icon name="user-secret" /> You{" "}
                <Icon name="arrow-right" /> <Icon name="users" /> Students{" "}
              </span>
            }
            tip="Copy the files for this assignment from this project to all other student projects."
          >
            <Icon name="share-square" /> Assign...
          </Tip>
        </Button>,
        <Progress
          key="progress"
          done={status.assignment}
          not_done={status.not_assignment}
          step="assigned"
          skipped={assignment.get("skip_assignment")}
        />,
      ];
    }

    function render_copy_confirms(status) {
      const steps = STEPS(is_peer_graded());
      const result: (ReactElement<any> | undefined)[] = [];
      for (const step of steps) {
        if (copy_confirm_state[step]) {
          result.push(render_copy_confirm(step, status));
        } else {
          result.push(undefined);
        }
      }
      return result;
    }

    function render_copy_confirm(step, status) {
      return (
        <span key={`copy_confirm_${step}`}>
          {status[step] === 0
            ? render_copy_confirm_to_all(step, status)
            : undefined}
          {status[step] !== 0
            ? render_copy_confirm_to_all_or_new(step, status)
            : undefined}
        </span>
      );
    }

    function render_copy_cancel(step) {
      const cancel = () => {
        set_copy_confirm_state(step, false);
        set_copy_confirm_all(step, false);
        set_copy_confirm(false);
        set_copy_assignment_confirm_overwrite(false);
      };
      return (
        <Button key="cancel" onClick={cancel}>
          Close
        </Button>
      );
    }

    function render_copy_assignment_confirm_overwrite(step) {
      if (!copy_assignment_confirm_overwrite) {
        return;
      }
      const do_it = () => {
        copy_assignment(step, false, true);
        set_copy_assignment_confirm_overwrite(false);
        set_copy_assignment_confirm_overwrite_text("");
      };
      return (
        <div style={{ marginTop: "15px" }}>
          Type in "OVERWRITE" if you are sure you want to overwrite any work
          they may have.
          <FormGroup>
            <FormControl
              autoFocus
              type="text"
              onChange={(e) =>
                set_copy_assignment_confirm_overwrite_text(
                  (e.target as any).value
                )
              }
              style={{ marginTop: "1ex" }}
            />
          </FormGroup>
          <ButtonGroup style={{ textAlign: "center", marginTop: "15px" }}>
            <Button
              disabled={copy_assignment_confirm_overwrite_text !== "OVERWRITE"}
              bsStyle="danger"
              onClick={do_it}
            >
              <Icon name="exclamation-triangle" /> Confirm replacing files
            </Button>
            {render_copy_cancel(step)}
          </ButtonGroup>
        </div>
      );
    }

    function copy_assignment(
      step,
      new_only: boolean,
      overwrite: boolean = false
    ) {
      // assign assignment to all (non-deleted) students
      const actions = get_actions();
      const assignment_id: string | undefined = assignment.get("assignment_id");
      if (assignment_id == null) throw Error("bug");
      switch (step) {
        case "assignment":
          actions.assignments.copy_assignment_to_all_students(
            assignment_id,
            new_only,
            overwrite
          );
          break;
        case "collect":
          actions.assignments.copy_assignment_from_all_students(
            assignment_id,
            new_only
          );
          break;
        case "peer_assignment":
          actions.assignments.peer_copy_to_all_students(
            assignment_id,
            new_only
          );
          break;
        case "peer_collect":
          actions.assignments.peer_collect_from_all_students(
            assignment_id,
            new_only
          );
          break;
        case "return_graded":
          actions.assignments.return_assignment_to_all_students(
            assignment_id,
            new_only
          );
          break;
        default:
          console.log(`BUG -- unknown step: ${step}`);
      }
      set_copy_confirm_state(step, false);
      set_copy_confirm_all(step, false);
      set_copy_confirm(false);
    }

    function render_skip(step: AssignmentCopyStep): Rendered {
      if (step === "return_graded") {
        return;
      }
      return (
        <div style={{ float: "right" }}>
          <SkipCopy
            assignment={assignment}
            step={step}
            actions={get_actions()}
          />
        </div>
      );
    }

    function render_has_student_subdir(step: AssignmentCopyStep): Rendered {
      if (step != "assignment" || !assignment.get("has_student_subdir")) return;
      return (
        <Alert
          style={{ marginBottom: "15px" }}
          type="info"
          message={`NOTE: Only the ${STUDENT_SUBDIR}/ subdirectory will be copied to the students.`}
        />
      );
    }

    function render_parallel() {
      const n = get_store().get_copy_parallel();
      return (
        <Tip
          title={`Parallel limit: copy ${n} assignments at a time`}
          tip="This is the max number of assignments to copy in parallel.  Change this in course configuration."
        >
          <div style={{ marginTop: "10px", fontWeight: 400 }}>
            Copy up to {n} assignments at once.
          </div>
        </Tip>
      );
    }

    function render_copy_confirm_to_all(
      step: AssignmentCopyStep,
      status
    ): Rendered {
      const n = status[`not_${step}`];
      const message = (
        <div>
          {" "}
          <div style={{ marginBottom: "15px" }}>
            {capitalize(step_verb(step))} this homework {step_direction(step)}{" "}
            the {n} student{n > 1 ? "s" : ""}
            {step_ready(step, n)}?
          </div>
          {render_has_student_subdir(step)}
          {render_skip(step)}
          <ButtonGroup>
            <Button
              key="yes"
              bsStyle="primary"
              onClick={() => copy_assignment(step, false)}
            >
              Yes
            </Button>
            {render_copy_cancel(step)}
          </ButtonGroup>
          {render_parallel()}
        </div>
      );
      return (
        <Alert
          type="warning"
          key={`${step}_confirm_to_all`}
          style={{ marginTop: "15px" }}
          message={message}
        />
      );
    }

    function copy_confirm_all_caution(
      step: AssignmentCopyStep
    ): Rendered | string {
      switch (step) {
        case "assignment":
          return (
            <span>
              This will recopy all of the files to them. CAUTION: if you update
              a file that a student has also worked on, their work will get
              copied to a backup file ending in a tilde, or possibly only be
              available in snapshots. Select "Replace student files!" in case
              you do <b>not</b> want to create any backups and also{" "}
              <b>delete</b> all other files in the assignment directory of their
              projects.{" "}
              <a
                target="_blank"
                href="https://github.com/sagemathinc/cocalc/wiki/CourseCopy"
              >
                (more details)
              </a>
              .
            </span>
          );
        case "collect":
          return "This will recollect all of the homework from them.  CAUTION: if you have graded/edited a file that a student has updated, your work will get copied to a backup file ending in a tilde, or possibly only be available in snapshots.";
        case "return_graded":
          return "This will rereturn all of the graded files to them.";
        case "peer_assignment":
          return "This will recopy all of the files to them.  CAUTION: if there is a file a student has also worked on grading, their work will get copied to a backup file ending in a tilde, or possibly be only available in snapshots.";
        case "peer_collect":
          return "This will recollect all of the peer-graded homework from the students.  CAUTION: if you have graded/edited a previously collected file that a student has updated, your work will get copied to a backup file ending in a tilde, or possibly only be available in snapshots.";
      }
    }

    function render_copy_confirm_overwrite_all(
      step: AssignmentCopyStep
    ): Rendered {
      return (
        <div key={"copy_confirm_overwrite_all"} style={{ marginTop: "15px" }}>
          <div style={{ marginBottom: "15px" }}>
            {copy_confirm_all_caution(step)}
          </div>
          <ButtonGroup>
            <Button
              key={"all"}
              bsStyle={"warning"}
              disabled={copy_assignment_confirm_overwrite}
              onClick={() => copy_assignment(step, false)}
            >
              Yes, do it (with backup)
            </Button>
            {step === "assignment" ? (
              <Button
                key={"all-overwrite"}
                bsStyle={"warning"}
                onClick={() => set_copy_assignment_confirm_overwrite(true)}
                disabled={copy_assignment_confirm_overwrite}
              >
                Replace student files!
              </Button>
            ) : undefined}
            {render_copy_cancel(step)}
          </ButtonGroup>
          {render_copy_assignment_confirm_overwrite(step)}
        </div>
      );
    }

    function render_copy_confirm_to_all_or_new(
      step: AssignmentCopyStep,
      status
    ): Rendered {
      const n = status[`not_${step}`];
      const m = n + status[step];
      const message = (
        <div>
          <div style={{ marginBottom: "15px" }}>
            {capitalize(step_verb(step))} this homework {step_direction(step)}
            ...
          </div>
          {render_has_student_subdir(step)}
          {render_skip(step)}
          <ButtonGroup>
            <Button
              key="all"
              bsStyle="danger"
              onClick={() => {
                set_copy_confirm_all(step, true);
                set_copy_confirm(true);
              }}
              disabled={copy_confirm_all[step]}
            >
              {step === "assignment" ? "All" : "The"} {m} students
              {step_ready(step, m)}...
            </Button>
            {n ? (
              <Button
                key="new"
                bsStyle="primary"
                onClick={() => copy_assignment(step, true)}
              >
                The {n} student{n > 1 ? "s" : ""} not already {step_verb(step)}
                ed {step_direction(step)}
              </Button>
            ) : undefined}
            {render_copy_cancel(step)}
          </ButtonGroup>
          {copy_confirm_all[step]
            ? render_copy_confirm_overwrite_all(step)
            : undefined}
          {render_parallel()}
        </div>
      );
      return (
        <Alert
          type="warning"
          key={`${step}_confirm_to_all_or_new`}
          style={{ marginTop: "15px" }}
          message={message}
        />
      );
    }

    function render_collect_tip() {
      return (
        <span key="normal">
          Collect an assignment from all of your students. (There is currently
          no way to schedule collection at a specific time; instead, collection
          happens when you click the button.)
        </span>
      );
    }

    function render_button(state: AssignmentCopyStep, status) {
      switch (state) {
        case "collect":
          return render_collect_button(status);
        case "return_graded":
          return render_return_graded_button(status);
        case "peer_assignment":
          return render_peer_assignment_button(status);
        case "peer_collect":
          return render_peer_collect_button(status);
        case "assignment":
          return render_assignment_button(status);
      }
    }

    function render_collect_button(status) {
      let bsStyle;
      if (status.assignment === 0) {
        // no button if nothing ever assigned
        return;
      }
      if (status.collect > 0) {
        // Have already collected something
        if (status.not_collect === 0) {
          bsStyle = "success";
        } else {
          bsStyle = "warning";
        }
      } else {
        bsStyle = "primary";
      }
      return [
        <Button
          key="collect"
          onClick={() => {
            set_copy_confirm_state("collect", true);
            set_copy_confirm(true);
          }}
          disabled={copy_confirm}
          bsStyle={bsStyle}
        >
          <Tip
            title={
              <span>
                Collect: <Icon name="users" /> Students{" "}
                <Icon name="arrow-right" /> <Icon name="user-secret" /> You
              </span>
            }
            tip={render_collect_tip()}
          >
            <Icon name="share-square" rotate={"180"} /> Collect...
          </Tip>
        </Button>,
        <Progress
          key="progress"
          done={status.collect}
          not_done={status.not_collect}
          step="collected"
          skipped={assignment.get("skip_collect")}
        />,
      ];
    }

    function render_peer_assign_tip() {
      return (
        <span key="normal">
          Send copies of collected homework out to all students for peer
          grading.
        </span>
      );
    }

    function render_peer_assignment_button(status) {
      // Render the "Peer Assign..." button in the top row, for peer assigning to all
      // students in the course.
      let bsStyle;
      if (status.peer_assignment == null) {
        // not peer graded
        return;
      }
      if (status.not_collect + status.not_assignment > 0) {
        // collect everything before peer grading
        return;
      }
      if (status.collect === 0) {
        // nothing to peer assign
        return;
      }
      if (status.peer_assignment > 0) {
        // haven't peer-assigned anything yet
        if (status.not_peer_assignment === 0) {
          bsStyle = "success";
        } else {
          bsStyle = "warning";
        }
      } else {
        // warning, since we have assigned already and this may overwrite
        bsStyle = "primary";
      }
      return [
        <Button
          key="peer-assign"
          onClick={() => {
            set_copy_confirm_state("peer_assignment", true);
            set_copy_confirm(true);
          }}
          disabled={copy_confirm}
          bsStyle={bsStyle}
        >
          <Tip
            title={
              <span>
                Peer Assign: <Icon name="users" /> You{" "}
                <Icon name="arrow-right" /> <Icon name="user-secret" /> Students
              </span>
            }
            tip={render_peer_assign_tip()}
          >
            <Icon name="share-square" /> Peer Assign...
          </Tip>
        </Button>,
        <Progress
          key="progress"
          done={status.peer_assignment}
          not_done={status.not_peer_assignment}
          step="peer assigned"
        />,
      ];
    }

    function render_peer_collect_tip() {
      return (
        <span key="normal">
          Collect the peer grading that your students did.
        </span>
      );
    }

    function render_peer_collect_button(status) {
      // Render the "Peer Collect..." button in the top row, for collecting peer grading from all
      // students in the course.
      let bsStyle;
      if (status.peer_collect == null) {
        return;
      }
      if (status.peer_assignment === 0) {
        // haven't even peer assigned anything -- so nothing to collect
        return;
      }
      if (status.not_peer_assignment > 0) {
        // everybody must have received peer assignment, or collecting isn't allowed
        return;
      }
      if (status.peer_collect > 0) {
        // haven't peer-collected anything yet
        if (status.not_peer_collect === 0) {
          bsStyle = "success";
        } else {
          bsStyle = "warning";
        }
      } else {
        // warning, since we have already collected and this may overwrite
        bsStyle = "primary";
      }
      return [
        <Button
          key="peer-collect"
          onClick={() => {
            set_copy_confirm_state("peer_collect", true);
            set_copy_confirm(true);
          }}
          disabled={copy_confirm}
          bsStyle={bsStyle}
        >
          <Tip
            title={
              <span>
                Peer Collect: <Icon name="users" /> Students{" "}
                <Icon name="arrow-right" /> <Icon name="user-secret" /> You
              </span>
            }
            tip={render_peer_collect_tip()}
          >
            <Icon name="share-square" rotate="180" /> Peer Collect...
          </Tip>
        </Button>,
        <Progress
          key="progress"
          done={status.peer_collect}
          not_done={status.not_peer_collect}
          step="peer collected"
        />,
      ];
    }

    function toggle_skip_grading() {
      get_actions().assignments.set_skip(
        assignment.get("assignment_id"),
        "grading",
        !assignment.get("skip_grading")
      );
    }

    function render_skip_grading_button(status) {
      if (status.collect === 0) {
        // No button if nothing collected.
        return;
      }
      const icon: IconName = assignment.get("skip_grading")
        ? "check-square-o"
        : "square-o";
      return (
        <Button onClick={toggle_skip_grading}>
          <Icon name={icon} /> Skip entering grades
        </Button>
      );
    }

    function render_nbgrader_button(status) {
      if (
        status.collect === 0 ||
        !assignment.get("nbgrader") ||
        assignment.get("skip_grading")
      ) {
        // No button if nothing collected or not nbgrader support or
        // decided to skip grading
        return;
      }

      return (
        <NbgraderButton
          assignment_id={assignment.get("assignment_id")}
          name={name}
        />
      );
    }

    function render_return_graded_button(status) {
      if (status.collect === 0) {
        // No button if nothing collected.
        return;
      }
      if (status.peer_collect != null && status.peer_collect === 0) {
        // Peer grading enabled, but we didn't collect anything yet
        return;
      }
      if (
        !assignment.get("skip_grading") &&
        status.not_return_graded === 0 &&
        status.return_graded === 0
      ) {
        // Nothing unreturned and ungraded yet and also nothing returned yet
        return;
      }
      let bsStyle;
      if (status.return_graded > 0) {
        // Have already returned some
        if (status.not_return_graded === 0) {
          bsStyle = "success";
        } else {
          bsStyle = "warning";
        }
      } else {
        bsStyle = "primary";
      }
      return [
        <Button
          key="return"
          onClick={() => {
            set_copy_confirm_state("return_graded", true);
            set_copy_confirm(true);
          }}
          disabled={copy_confirm}
          bsStyle={bsStyle}
        >
          <Tip
            title={
              <span>
                Return: <Icon name="user-secret" /> You{" "}
                <Icon name="arrow-right" /> <Icon name="users" /> Students{" "}
              </span>
            }
            tip="Copy the graded versions of files for this assignment from this project to all other student projects."
          >
            <Icon name="share-square" /> Return...
          </Tip>
        </Button>,
        <Progress
          key="progress"
          done={status.return_graded}
          not_done={status.not_return_graded}
          step="returned"
        />,
      ];
    }

    function delete_assignment() {
      get_actions().assignments.delete_assignment(
        assignment.get("assignment_id")
      );
      return set_confirm_delete(false);
    }

    function undelete_assignment() {
      return get_actions().assignments.undelete_assignment(
        assignment.get("assignment_id")
      );
    }

    function render_confirm_delete() {
      const message = (
        <div>
          Are you sure you want to delete this assignment?
          <br /> <br />
          <ButtonGroup>
            <Button key="yes" onClick={delete_assignment} bsStyle="danger">
              <Icon name="trash" /> Delete
            </Button>
            <Button key="no" onClick={() => set_confirm_delete(false)}>
              Cancel
            </Button>
          </ButtonGroup>
        </div>
      );
      return <Alert type="warning" key="confirm_delete" message={message} />;
    }

    function render_delete_button() {
      if (assignment.get("deleted")) {
        return (
          <Tip
            key="delete"
            placement="left"
            title="Undelete assignment"
            tip="Make the assignment visible again in the assignment list and in student grade lists."
          >
            <Button onClick={undelete_assignment}>
              <Icon name="trash" /> Undelete
            </Button>
          </Tip>
        );
      } else {
        return (
          <Tip
            key="delete"
            placement="left"
            title="Delete assignment"
            tip="Deleting this assignment removes it from the assignment list and student grade lists, but does not delete any files off of disk.  You can always undelete an assignment later by showing it using the 'show deleted assignments' button."
          >
            <Button
              onClick={() => set_confirm_delete(true)}
              disabled={confirm_delete}
            >
              <Icon name="trash" /> Delete
            </Button>
          </Tip>
        );
      }
    }

    function render_configure_peer() {
      return (
        <ConfigurePeerGrading actions={get_actions()} assignment={assignment} />
      );
    }

    function render_peer_button() {
      let icon;
      if (is_peer_graded()) {
        icon = "check-square-o";
      } else {
        icon = "square-o";
      }
      return (
        <Button
          disabled={expand_peer_config}
          onClick={() =>
            get_actions().toggle_item_expansion(
              "peer_config",
              assignment.get("assignment_id")
            )
          }
        >
          <Icon name={icon} /> Peer Grading...
        </Button>
      );
    }

    function render_summary_due_date() {
      const due_date = assignment.get("due_date");
      if (due_date) {
        return (
          <div style={{ marginTop: "12px" }}>
            Due <BigTime date={due_date} />
          </div>
        );
      }
    }

    function render_assignment_name() {
      const num_items = assignment.get("listing")?.size ?? 0;
      return (
        <span>
          {trunc_middle(assignment.get("path"), 80)}
          {assignment.get("deleted") ? <b> (deleted)</b> : undefined}
          {num_items == 0 ? "  - add content to this assignment..." : undefined}
        </span>
      );
    }

    function render_assignment_title_link() {
      return (
        <a
          href=""
          onClick={(e) => {
            e.preventDefault();
            get_actions().toggle_item_expansion(
              "assignment",
              assignment.get("assignment_id")
            );
          }}
        >
          <Icon
            style={{ marginRight: "10px" }}
            name={is_expanded ? "caret-down" : "caret-right"}
          />
          {render_assignment_name()}
        </a>
      );
    }

    function render_summary_line() {
      return (
        <Row key="summary" style={{ backgroundColor: background }}>
          <Col md={12}>
            <h5>{render_assignment_title_link()}</h5>
          </Col>
          <Col md={12}>{render_summary_due_date()}</Col>
        </Row>
      );
    }

    return (
      <div>
        <Row style={is_expanded ? styles.selected_entry : styles.entry_style}>
          <Col xs={24}>
            {render_summary_line()}
            {is_expanded ? render_more() : undefined}
          </Col>
        </Row>
      </div>
    );
  },
  isSame
);
