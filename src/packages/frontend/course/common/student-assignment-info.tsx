/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Button, Col, Input, Row, Space } from "antd";
import { ReactNode, useRef, useState } from "react";
import { useIntl } from "react-intl";

import { useActions } from "@cocalc/frontend/app-framework";
import { Icon, Markdown, Tip } from "@cocalc/frontend/components";
import { MarkdownInput } from "@cocalc/frontend/editors/markdown-input";
import { NotebookScores } from "@cocalc/frontend/jupyter/nbgrader/autograde";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { CopyStepStatus } from ".";
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
import {
  GRADE_FLEX,
  STEP_NAMES,
  Steps,
  STEPS_INTL,
  STEPS_INTL_ACTIVE,
} from "./consts";

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
  const clicked_nbgrader = useRef<Date | undefined>(undefined);
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
        <Space align="start" style={{ margin: "5px 0" }}>
          <Input
            placeholder="Grade..."
            value={grade ?? ""}
            onChange={(e) =>
              actions.assignments.set_grade(
                assignment.get("assignment_id"),
                student.get("student_id"),
                e.target.value,
              )
            }
            onPressEnter={() => stop_editing()}
            size={size}
            style={{ maxWidth: 180 }}
            autoFocus
          />
          <Button type="primary" size={size} onClick={() => stop_editing()}>
            Done
          </Button>
        </Space>
      );
    } else {
      const hasGrade = !!(grade ?? "").trim();
      const gradeText = intl.formatMessage(
        {
          id: "course.student-assignment-info.grade.label",
          defaultMessage: `{show, select, true {Grade: {grade}} other {Enter grade...}}`,
          description: "Grade of an assignment in an online course",
        },
        { grade, show: hasGrade },
      );

      if (hasGrade) {
        return (
          <Space align="center">
            <span>{gradeText}</span>
            <Button
              icon={<Icon name="pencil" />}
              onClick={() => set_edited_feedback()}
              disabled={is_editing}
              size={size}
              aria-label="Edit grade"
              title="Edit grade"
            />
          </Space>
        );
      } else {
        return (
          <Button
            key="edit"
            icon={<Icon name="pencil" />}
            onClick={() => set_edited_feedback()}
            disabled={is_editing}
            size={size}
          >
            {gradeText}
          </Button>
        );
      }
    }
  }

  function render_comments() {
    if (!is_editing) {
      if (!comments?.trim()) return;
      return (
        <div style={{ width: "100%" }}>
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
    const scores = nbgrader_scores ?? {};
    const hasScores = Object.keys(scores).length > 0;
    return (
      <div>
        <NbgraderScores
          show_all={is_editing}
          set_show_all={() => set_edited_feedback()}
          nbgrader_scores={scores}
          nbgrader_score_ids={nbgrader_score_ids}
          name={name}
          student_id={student.get("student_id")}
          assignment_id={assignment.get("assignment_id")}
          run_button={render_run_nbgrader(hasScores ? "redo" : "first")}
          buttonSize={size}
        />
      </div>
    );
  }

  function render_run_nbgrader(mode: "first" | "redo") {
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

    const isFirst = mode === "first";
    const iconName = isFirst ? "caret-right" : "redo";
    const tipTitle = isFirst ? "Run nbgrader" : "Run nbgrader again";
    const tipText = isFirst
      ? "Run nbgrader on this student's collected submission."
      : "Re-run nbgrader for this student's collected submission.";

    return (
      <Tip title={tipTitle} tip={tipText}>
        <Button
          key="nbgrader"
          icon={<Icon name={iconName} />}
          disabled={running}
          loading={running}
          size={size}
          aria-label={tipTitle}
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
        />
      </Tip>
    );
  }

  function render_nbgrader() {
    if (!assignment.get("nbgrader")) return;

    return render_nbgrader_scores();
  }

  function step_intl(step: Steps, active: boolean): string {
    return intl.formatMessage(active ? STEPS_INTL_ACTIVE : STEPS_INTL, {
      step: STEP_NAMES.indexOf(step),
    });
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
    const placement = step === "Return" ? "left" : "right";
    return (
      <CopyStepStatus
        stepLabel={step}
        activityLabel={step_intl(step, false)}
        data={data}
        enableCopy={enable_copy}
        tips={{ copy: copy_tip, open: open_tip }}
        handlers={{ open: do_open, copy: do_copy, stop: do_stop }}
        recopy={recopy[step]}
        setRecopy={(value) => set_recopy(step, value)}
        omitErrors={omit_errors}
        placement={placement}
        size={size}
        copyingLabel={step_intl(step, true)}
        showWhatHappensLink={step.toLowerCase() === "assign"}
      />
    );
  }

  let show_grade_col, show_return_graded;
  const peer_grade: boolean = !!assignment.getIn(["peer_grade", "enabled"]);
  const skip_grading: boolean = !!assignment.get("skip_grading");
  const skip_assignment: boolean = !!assignment.get("skip_assignment");
  const skip_collect: boolean = !!assignment.get("skip_collect");
  if (peer_grade) {
    show_grade_col = info.last_peer_collect;
    show_return_graded = grade || (skip_grading && info.last_peer_collect);
  } else {
    show_grade_col = info.last_collect || skip_collect;
    show_return_graded =
      grade ||
      (skip_grading && info.last_collect) ||
      (skip_grading && skip_collect);
  }

  function render_assignment_col() {
    return (
      <Col flex="1" key="last_assignment">
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
      <Col flex="1" key="last_collect">
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
    if (!info.peer_assignment || info.last_collect?.error != null) {
      return <Col flex="1" key="peer_assign" />;
    }
    return (
      <Col flex="1" key="peer_assign">
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
    if (!info.peer_collect) return <Col flex="1" key="peer_collect" />;
    return (
      <Col flex="1" key="peer_collect">
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
      <Col flex={GRADE_FLEX} key="grade">
        {show_grade_col && (
          <div>
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
      <Col flex="1" key="return_graded">
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
          {/* Gutter adds inner spacing but also negative row margins; zero margins avoid horizontal scroll. */}
          <Row gutter={[8, 0]} style={{ marginLeft: 0, marginRight: 0 }}>
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
