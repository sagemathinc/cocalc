/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Button, Col, Row, Space, Spin } from "antd";
import { ReactNode, useRef, useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";

import { useActions } from "@cocalc/frontend/app-framework";
import { Gap, Icon, Markdown, Tip } from "@cocalc/frontend/components";
import ShowError from "@cocalc/frontend/components/error";
import { COPY_TIMEOUT_MS } from "@cocalc/frontend/course/consts";
import { MarkdownInput } from "@cocalc/frontend/editors/markdown-input";
import { labels } from "@cocalc/frontend/i18n";
import { NotebookScores } from "@cocalc/frontend/jupyter/nbgrader/autograde";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { BigTime } from ".";
import { CourseActions } from "../actions";
import { NbgraderScores } from "../nbgrader/scores";
import {
  AssignmentRecord,
  LastCopyInfo,
  NBgraderRunInfo,
  StudentRecord,
} from "../store";
import { AssignmentCopyType } from "../types";
import { useButtonSize } from "../util";
import { STEP_NAMES, Steps, STEPS_INTL, STEPS_INTL_ACTIVE } from "./consts";

interface StudentAssignmentInfoProps {
  name: string;
  title: ReactNode;
  student: StudentRecord;
  assignment: AssignmentRecord;
  grade?: string;
  comments?: string;
  info: {
    assignment_id: string;
    student_id: string;
    peer_assignment: boolean;
    peer_collect: boolean;
    last_assignment?: LastCopyInfo;
    last_collect?: LastCopyInfo;
    last_peer_assignment?: LastCopyInfo;
    last_peer_collect?: LastCopyInfo;
    last_return_graded?: LastCopyInfo;
  };
  nbgrader_scores?: { [ipynb: string]: NotebookScores | string };
  nbgrader_score_ids?: { [ipynb: string]: string[] };
  is_editing: boolean;
  nbgrader_run_info?: NBgraderRunInfo;
}

interface RenderLastProps {
  step: Steps;
  type: AssignmentCopyType;
  data?: any;
  enable_copy?: boolean;
  copy_tip?: string;
  open_tip?: string;
  omit_errors?: boolean;
}

const RECOPY_INIT: Record<Steps, false> = {
  Assign: false,
  Collect: false,
  "Peer Assign": false,
  Return: false,
  "Peer Collect": false,
} as const;

function useRecopy(): [
  typeof RECOPY_INIT,
  (key: Steps, value: boolean) => void,
] {
  const [recopy, set_recopy] = useState<typeof RECOPY_INIT>(RECOPY_INIT);
  function set(key: Steps, value: boolean) {
    set_recopy({ ...recopy, [key]: value });
  }
  return [recopy, set];
}

export function StudentAssignmentInfo({
  name,
  title,
  student,
  assignment,
  grade = "",
  comments = "",
  info,
  nbgrader_scores,
  nbgrader_score_ids,
  is_editing,
  nbgrader_run_info,
}: StudentAssignmentInfoProps) {
  const intl = useIntl();
  const clicked_nbgrader = useRef<Date|undefined>(undefined);
  const actions = useActions<CourseActions>({ name });
  const size = useButtonSize();
  const [recopy, set_recopy] = useRecopy();

  function open(
    type: AssignmentCopyType,
    assignment_id: string,
    student_id: string,
  ) {
    return actions.assignments.open_assignment(type, assignment_id, student_id);
  }

  function copy(
    type: AssignmentCopyType,
    assignment_id: string,
    student_id: string,
  ) {
    return actions.assignments.copy_assignment(type, assignment_id, student_id);
  }

  function stop(
    type: AssignmentCopyType,
    assignment_id: string,
    student_id: string,
  ) {
    actions.assignments.stop_copying_assignment(
      assignment_id,
      student_id,
      type,
    );
  }

  function set_edited_feedback() {
    actions.assignments.update_edited_feedback(
      assignment.get("assignment_id"),
      student.get("student_id"),
    );
  }

  function stop_editing() {
    actions.assignments.clear_edited_feedback(
      assignment.get("assignment_id"),
      student.get("student_id"),
    );
  }

  function render_grade() {
    if (is_editing) {
      return (
        <MarkdownInput
          placeholder="Grade..."
          value={grade || ""}
          onBlur={(grade) => {
            actions.assignments.set_grade(
              assignment.get("assignment_id"),
              student.get("student_id"),
              grade,
            );
          }}
          onShiftEnter={() => stop_editing()}
          height="3em"
          hideHelp
          style={{ margin: "5px 0" }}
          autoFocus
        />
      );
    } else {
      const text = intl.formatMessage(
        {
          id: "course.student-assignment-info.grade.label",
          defaultMessage: `{show, select, true {Grade: {grade}} other {Enter grade...}}`,
          description: "Grade of an assignment in an online course",
        },
        { grade, show: !!((grade ?? "").trim() || (comments ?? "").trim()) },
      );

      return (
        <Button
          key="edit"
          onClick={() => set_edited_feedback()}
          disabled={is_editing}
          size={size}
        >
          {text}
        </Button>
      );
    }
  }

  function render_comments() {
    if (!is_editing) {
      if (!comments?.trim()) return;
      return (
        <div style={{ width: "100%", paddingRight: "5px" }}>
          <Markdown
            value={comments}
            style={{
              width: "100%",
              maxHeight: "4em",
              overflowY: "auto",
              padding: "5px",
              border: "1px solid lightgray",
              cursor: "pointer",
              display: "inline-block",
            }}
            onClick={() => set_edited_feedback()}
          />
        </div>
      );
    } else {
      return (
        <MarkdownInput
          placeholder="Optional markdown comments..."
          value={comments || ""}
          onBlur={(comment) => {
            actions.assignments.set_comment(
              assignment.get("assignment_id"),
              student.get("student_id"),
              comment,
            );
          }}
          onShiftEnter={() => stop_editing()}
          height="7em"
          hideHelp
        />
      );
    }
  }

  function render_nbgrader_scores() {
    if (!nbgrader_scores) return;
    return (
      <div>
        <NbgraderScores
          show_all={is_editing}
          set_show_all={() => set_edited_feedback()}
          nbgrader_scores={nbgrader_scores}
          nbgrader_score_ids={nbgrader_score_ids}
          name={name}
          student_id={student.get("student_id")}
          assignment_id={assignment.get("assignment_id")}
        />
        {render_run_nbgrader("Run nbgrader again")}
      </div>
    );
  }

  function render_run_nbgrader(label: React.JSX.Element | string) {
    let running = false;
    if (nbgrader_run_info != null) {
      const t = nbgrader_run_info.get(
        assignment.get("assignment_id") + "-" + student.get("student_id"),
      );
      if (t && webapp_client.server_time() - t <= 1000 * 60 * 10) {
        // Time starting is set and it's also within the last few minutes.
        // This "few minutes" is just in case -- we probably shouldn't need
        // that at all ever, but it could make cocalc state usable in case of
        // weird issues, I guess).  User could also just close and re-open
        // the course file, which resets this state completely.
        running = true;
      }
    }
    label = running ? (
      <span>
        {" "}
        <Spin /> Running nbgrader
      </span>
    ) : (
      <span>{label}</span>
    );

    return (
      <div style={{ marginTop: "5px" }}>
        <Button
          key="nbgrader"
          disabled={running}
          size={size}
          onClick={() => {
            if (
              clicked_nbgrader.current != null &&
              webapp_client.server_time() -
                clicked_nbgrader.current.valueOf() <=
                3000
            ) {
              // User *just* clicked, and we want to avoid double click
              // running nbgrader twice.
              return;
            }

            clicked_nbgrader.current = new Date();
            actions.assignments.run_nbgrader_for_one_student(
              assignment.get("assignment_id"),
              student.get("student_id"),
            );
          }}
        >
          <Icon name="graduation-cap" /> {label}
        </Button>
      </div>
    );
  }

  function render_nbgrader() {
    if (nbgrader_scores) {
      return render_nbgrader_scores();
    }
    if (!assignment.get("nbgrader") || assignment.get("skip_grading")) return;

    return render_run_nbgrader("Run nbgrader");
  }

  function render_save_button() {
    if (!is_editing) return;
    return (
      <Button key="save" size={size} onClick={() => stop_editing()}>
        Save
      </Button>
    );
  }

  function render_last_time(time: string | number | Date) {
    return (
      <Space key="time" wrap>
        <BigTime date={time} />
      </Space>
    );
  }

  function render_recopy_confirm(
    step: Steps,
    copy: Function,
    copy_tip: string,
    placement,
  ) {
    if (recopy[step]) {
      const v: React.JSX.Element[] = [];
      v.push(
        <Tip
          key="copy_cancel"
          title={intl.formatMessage(labels.cancel)}
          tip={intl.formatMessage(labels.cancel)}
        >
          <Button size={size} onClick={() => set_recopy(step, false)}>
            {intl.formatMessage(labels.cancel)}
          </Button>
        </Tip>,
      );
      v.push(
        <Tip key="recopy_confirm" title={step} placement={placement} tip={copy_tip}>
          <Button
            danger
            size={size}
            onClick={() => {
              set_recopy(step, false);
              copy();
            }}
          >
            <FormattedMessage
              id="course.student-assignment-info.recopy_confirm.label"
              defaultMessage={`Yes, {activity} again`}
              description={"Confirm an activity, like 'assign', 'collect', ..."}
              values={{ activity: step_intl(step, false).toLowerCase() }}
            />
          </Button>
        </Tip>,
      );
      if (step.toLowerCase() === "assign") {
        // inline-block because buttons above are float:left
        v.push(
          <div
            key="what-happens"
            style={{ margin: "5px", display: "inline-block" }}
          >
            <a
              target="_blank"
              href="https://doc.cocalc.com/teaching-tips_and_tricks.html#how-exactly-are-assignments-copied-to-students"
            >
              {intl.formatMessage({
                id: "course.student-assignment-info.recopy.what_happens",
                defaultMessage: "What happens when I assign again?",
                description:
                  "Asking the question, what happens if all files are transferred to all students in an online course once again.",
              })}
            </a>
          </div>,
        );
      }
      return <Space wrap>{v}</Space>;
    } else {
      return (
        <Tip title={step} placement={placement} tip={copy_tip}>
          <Button
            key="copy"
            type="dashed"
            size={size}
            onClick={() => set_recopy(step, true)}
          >
            <Icon name="redo" />
          </Button>
        </Tip>
      );
    }
  }

  function render_open_recopy(
    step: Steps,
    open,
    copy,
    copy_tip: string,
    open_tip: string,
  ) {
    const placement = step === "Return" ? "left" : "right";
    return (
      <Space key="open_recopy" wrap>
        {render_recopy_confirm(step, copy, copy_tip, placement)}
        <Tip title="Open assignment" placement={placement} tip={open_tip}>
          <Button key="open" size={size} onClick={open}>
            <Icon name="folder-open" />
          </Button>
        </Tip>
      </Space>
    );
  }

  function step_intl(step: Steps, active: boolean): string {
    return intl.formatMessage(active ? STEPS_INTL_ACTIVE : STEPS_INTL, {
      step: STEP_NAMES.indexOf(step),
    });
  }

  function render_open_copying(step: Steps, open, stop) {
    return (
      <Space key="open_copying" wrap>
        <Button key="copy" disabled={true} size={size}>
          <Spin /> {step_intl(step, true)}
        </Button>
        <Button key="stop" danger onClick={stop} size={size}>
          {intl.formatMessage(labels.cancel)} <Icon name="times" />
        </Button>
        <Tip title="Open assignment" placement={step === "Return" ? "left" : "right"} tip="">
          <Button key="open" onClick={open} size={size}>
            <Icon name="folder-open" />
          </Button>
        </Tip>
      </Space>
    );
  }

  function render_copy(step: Steps, copy: () => void, copy_tip: string) {
    let placement;
    if (step === "Return") {
      placement = "left";
    }
    return (
      <Tip key="copy" title={step} tip={copy_tip} placement={placement}>
        <Button onClick={copy} size={size}>
          <Icon name="caret-right" />
        </Button>
      </Tip>
    );
  }

  function render_error(step: Steps, error) {
    if (typeof error !== "string") {
      error = `${error}`;
    }
    if (error.includes("[object Object]")) {
      // already too late to know the actual error -- it got mangled/reported incorrectly
      error = "";
    }
    // We search for two different error messages, since different errors happen in
    // KuCalc versus other places cocalc runs.  It depends on what is doing the copy.
    if (
      error.indexOf("No such file or directory") !== -1 ||
      error.indexOf("ENOENT") != -1
    ) {
      error = `The student might have renamed or deleted the directory that contained their assignment.  Open their project and see what happened.   If they renamed it, you could rename it back, then collect the assignment again -- \n${error}`;
    } else {
      error = `Try to ${step.toLowerCase()} again -- \n${error}`;
    }
    return (
      <ShowError
        key="error"
        error={error}
        style={{
          marginTop: "5px",
          maxHeight: "140px",
          overflow: "auto",
          display: "block",
        }}
      />
    );
  }

  function Status({
    step,
    type,
    data = {},
    enable_copy = false,
    copy_tip = "",
    open_tip = "",
    omit_errors = false,
  }: RenderLastProps): React.JSX.Element {
    const do_open = () => open(type, info.assignment_id, info.student_id);
    const do_copy = () => copy(type, info.assignment_id, info.student_id);
    const do_stop = () => stop(type, info.assignment_id, info.student_id);
    const v: React.JSX.Element[] = [];
    if (enable_copy) {
      if (webapp_client.server_time() - (data.start ?? 0) < COPY_TIMEOUT_MS) {
        v.push(render_open_copying(step, do_open, do_stop));
      } else if (data.time) {
        v.push(
          render_open_recopy(
            step,
            do_open,
            do_copy,
            copy_tip as string,
            open_tip as string,
          ),
        );
      } else {
        v.push(render_copy(step, do_copy, copy_tip as string));
      }
    }
    if (data.time) {
      v.push(render_last_time(data.time));
    }
    if (data.error && !omit_errors) {
      v.push(render_error(step, data.error));
    }
    return <>{v}</>;
  }

  let show_grade_col, show_return_graded;
  const peer_grade: boolean = !!assignment.getIn(["peer_grade", "enabled"]);
  const skip_grading: boolean = !!assignment.get("skip_grading");
  const skip_assignment: boolean = !!assignment.get("skip_assignment");
  const skip_collect: boolean = !!assignment.get("skip_collect");
  if (peer_grade) {
    show_grade_col = !skip_grading && info.last_peer_collect;
    show_return_graded = grade || (skip_grading && info.last_peer_collect);
  } else {
    show_grade_col = (!skip_grading && info.last_collect) || skip_collect;
    show_return_graded =
      grade ||
      (skip_grading && info.last_collect) ||
      (skip_grading && skip_collect);
  }

  const width = peer_grade ? 4 : 6;

  function render_assignment_col() {
    return (
      <Col md={width} key="last_assignment">
        <Status
          step="Assign"
          data={info.last_assignment}
          type="assigned"
          enable_copy={true}
          copy_tip={intl.formatMessage({
            id: "course.student-assignment-info.assignment_col.copy.tooltip",
            defaultMessage: `Copy the assignment from your project to this student's project so they can do their homework.`,
            description: "files of a student in an online course",
          })}
          open_tip={intl.formatMessage({
            id: "course.student-assignment-info.assignment_col.open.tooltip",
            defaultMessage: `Open the student's copy of this assignment directly in their project.
              You will be able to see them type, chat with them, leave them hints, etc.`,
            description: "files of a student in an online course",
          })}
          omit_errors={skip_assignment}
        />
      </Col>
    );
  }

  function render_collect_col() {
    return (
      <Col md={width} key="last_collect">
        {skip_assignment ||
        !(info.last_assignment != null
          ? info.last_assignment.error
          : undefined) ? (
          <Status
            step="Collect"
            data={info.last_collect}
            type="collected"
            enable_copy={info.last_assignment != null || skip_assignment}
            copy_tip={intl.formatMessage({
              id: "course.student-assignment-info.collect_col.copy.tooltip",
              defaultMessage:
                "Copy the assignment from your student's project back to your project so you can grade their work.",
              description: "files of a student in an online course",
            })}
            open_tip={intl.formatMessage({
              id: "course.student-assignment-info.collect_col.open.tooltip",
              defaultMessage:
                "Open the copy of your student's work in your own project, so that you can grade their work.",
              description: "files of a student in an online course",
            })}
            omit_errors={skip_collect}
          />
        ) : undefined}
      </Col>
    );
  }

  function render_peer_assign_col() {
    if (!peer_grade) return;
    if (!info.peer_assignment) return;
    if (info.last_collect?.error != null) return;
    return (
      <Col md={4} key="peer_assign">
        <Status
          step="Peer Assign"
          data={info.last_peer_assignment}
          type={"peer-assigned"}
          enable_copy={info.last_collect != null}
          copy_tip={intl.formatMessage({
            id: "course.student-assignment-info.peer_assign_col.copy.tooltip",
            defaultMessage:
              "Copy collected assignments from your project to this student's project so they can grade them.",
            description: "files of a student in an online course",
          })}
          open_tip={intl.formatMessage({
            id: "course.student-assignment-info.peer_assign_col.open.tooltip",
            defaultMessage:
              "Open the student's copies of this assignment directly in their project, so you can see what they are peer grading.",
            description: "files of a student in an online course",
          })}
        />
      </Col>
    );
  }

  function render_peer_collect_col() {
    if (!peer_grade) return;
    if (!info.peer_collect) return;
    return (
      <Col md={4} key="peer_collect">
        <Status
          step="Peer Collect"
          data={info.last_peer_collect}
          type="peer-collected"
          enable_copy={info.last_peer_assignment != null}
          copy_tip={intl.formatMessage({
            id: "course.student-assignment-info.peer_collect_col.copy.tooltip",
            defaultMessage:
              "Copy the peer-graded assignments from various student projects back to your project so you can assign their official grade.",
            description: "files of a student in an online course",
          })}
          open_tip={intl.formatMessage({
            id: "course.student-assignment-info.peer_collect_col.open.tooltip",
            defaultMessage:
              "Open your copy of your student's peer grading work in your own project, so that you can grade their work.",

            description: "files of a student in an online course",
          })}
        />
      </Col>
    );
  }

  function render_grade_col() {
    //      {render_enter_grade()}
    return (
      <Col md={width} key="grade">
        {show_grade_col && (
          <div>
            {render_save_button()}
            {render_grade()}
            {render_comments()}
            {render_nbgrader()}
          </div>
        )}
      </Col>
    );
  }

  function render_return_graded_col() {
    return (
      <Col md={width} key="return_graded">
        {show_return_graded ? (
          <Status
            step="Return"
            data={info.last_return_graded}
            type="graded"
            enable_copy={info.last_collect != null || skip_collect}
            copy_tip={intl.formatMessage({
              id: "course.student-assignment-info.graded_col.copy.tooltip",
              defaultMessage: `Copy the graded assignment back to your student's project.`,
              description: "files of a student in an online course",
            })}
            open_tip={intl.formatMessage({
              id: "course.student-assignment-info.graded_col.open.tooltip",
              defaultMessage: `Open the copy of your student's work that you returned to them.
                  This opens the returned assignment directly in their project.`,
              description: "the files of a student in an online course",
            })}
          />
        ) : undefined}
      </Col>
    );
  }

  return (
    <div>
      <Row
        style={{
          borderTop: "1px solid #aaa",
          paddingTop: "5px",
          paddingBottom: "5px",
        }}
      >
        <Col md={4} key="title">
          {title}
        </Col>
        <Col md={20} key="rest">
          <Row>
            {render_assignment_col()}
            {render_collect_col()}
            {render_peer_assign_col()}
            {render_peer_collect_col()}
            {render_grade_col()}
            {render_return_graded_col()}
          </Row>
        </Col>
      </Row>
    </div>
  );
}
