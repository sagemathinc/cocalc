/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Button, Col, Input, Row, Space, Spin } from "antd";
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
          onClick={() => {
            if (
              clicked_nbgrader.current != null &&
              webapp_client.server_time() -
                clicked_nbgrader.current.valueOf() <=
                3000
            ) {
              // avoid firing nbgrader twice on rapid double-clicks
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
        <Tip
          key="recopy_confirm"
          title={step}
          placement={placement}
          tip={copy_tip}
        >
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
          <div key="what-happens">
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
      return v;
    } else {
      return [
        <Tip key="copy" title={step} placement={placement} tip={copy_tip}>
          <Button
            size={size}
            icon={<Icon name="redo" />}
            onClick={() => set_recopy(step, true)}
          />
        </Tip>,
      ];
    }
  }

  function render_open(open, tip: string, placement: string) {
    return (
      <Tip key="open" title="Open assignment" tip={tip} placement={placement}>
        <Button
          onClick={open}
          size={size}
          icon={<Icon name="folder-open" />}
        />
      </Tip>
    );
  }

  function step_intl(step: Steps, active: boolean): string {
    return intl.formatMessage(active ? STEPS_INTL_ACTIVE : STEPS_INTL, {
      step: STEP_NAMES.indexOf(step),
    });
  }

  function render_copying(step: Steps, stop) {
    return [
      <Button key="stop" danger onClick={stop} size={size}>
        {intl.formatMessage(labels.cancel)}
      </Button>,
      <Button key="copy" disabled={true} size={size}>
        <Spin /> {step_intl(step, true)}
      </Button>,
    ];
  }

  function render_copy(
    step: Steps,
    copy: () => void,
    tip: string,
    placement: string,
  ) {
    return (
      <Tip key="copy" title={step} tip={tip} placement={placement}>
        <Button onClick={copy} size={size} icon={<Icon name="caret-right" />} />
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
        style={{ padding: "4px 4px", overflowWrap: "anywhere" }}
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
    const placement = step === "Return" ? "left" : "right";
    if (enable_copy) {
      const now = webapp_client.server_time();
      const in_progress =
        data.start != null && now - data.start < COPY_TIMEOUT_MS;
      if (in_progress) {
        v.push(...render_copying(step, do_stop));
        v.push(render_open(do_open, open_tip, placement));
      } else if (data.time) {
        v.push(
          ...render_recopy_confirm(
            step,
            do_copy,
            copy_tip as string,
            placement,
          ),
        );
        v.push(render_open(do_open, open_tip as string, placement));
      } else {
        v.push(render_copy(step, do_copy, copy_tip as string, placement));
      }
    }
    if (data.time) {
      v.push(render_last_time(data.time));
    }
    if (data.error && !omit_errors) {
      v.push(render_error(step, data.error));
    }
    return <Space wrap>{v}</Space>;
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
          <Row gutter={[8, 0]}>
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
