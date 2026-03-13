/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Alert, Button, Input, Space, Switch } from "antd";
import { ReactElement, ReactNode, useEffect, useState } from "react";
import { DebounceInput } from "react-debounce-input";
import { useIntl } from "react-intl";

import { Loading, Tip } from "@cocalc/frontend/components";
import { webapp_client } from "@cocalc/frontend/webapp-client";

import { CourseActions } from "../actions";
import { nbgrader_status } from "../nbgrader/util";
import type { AssignmentRecord, NBgraderRunInfo } from "../store";
import type {
  AssignmentCopyStep,
  AssignmentStep,
  AssignmentStatus,
} from "../types";
import { STEPS } from "../util";
import { CopyRunAllAlert } from "./copy-run-all";
import {
  filterPlaceholder,
  nbgraderMessages,
  runAllAriaLabel,
  skipStepMessages,
} from "./course-unit-strings";
import { Progress } from "./progress";
import { RunAllPopover } from "./run-all-popover";
import { StudentAssignmentInfoHeader } from "./student-assignment-info-header";

interface AssignmentHeaderProps {
  assignment: AssignmentRecord;
  status: AssignmentStatus | null;
  numStudents: number;
  actions: CourseActions;
  studentSearch: string;
  setStudentSearch: (value: string) => void;
  nbgraderRunInfo?: NBgraderRunInfo;
}

export function AssignmentHeader({
  assignment,
  status,
  numStudents,
  actions,
  studentSearch,
  setStudentSearch,
  nbgraderRunInfo,
}: AssignmentHeaderProps) {
  const intl = useIntl();
  const [openedRunAll, setOpenedRunAll] = useState<AssignmentStep | null>(null);
  const [confirmAllStudents, setConfirmAllStudents] = useState<boolean>(false);
  const [confirmSyncGrades, setConfirmSyncGrades] = useState<boolean>(false);

  const assignmentId = assignment.get("assignment_id") ?? "";
  const store = actions.get_store();

  useEffect(() => {
    setOpenedRunAll(null);
    setConfirmAllStudents(false);
    setConfirmSyncGrades(false);
  }, [assignmentId]);

  if (status == null) {
    return <Loading key="loading_more" />;
  }

  // Keep a narrowed alias since many nested closures use this value and
  // TypeScript does not reliably preserve the non-null guard on `status`.
  const assignmentStatus = status;
  const peer = !!assignment.getIn(["peer_grade", "enabled"]);

  function renderStepPopover(
    step: AssignmentCopyStep,
    opts: {
      type: "primary" | "default";
      content: ReactNode;
      onOpen?: () => void;
      onClose?: () => void;
    },
  ) {
    const open = openedRunAll === step;
    const handleOpenChange = (next: boolean) => {
      setOpenedRunAll(next ? step : null);
      setConfirmAllStudents(false);
      setConfirmSyncGrades(false);
      if (next) {
        opts.onOpen?.();
      } else {
        opts.onClose?.();
      }
    };
    return (
      <RunAllPopover
        id={String(step)}
        open={open}
        onOpenChange={handleOpenChange}
        type={opts.type}
        content={opts.content}
        ariaLabel={runAllAriaLabel(intl, step)}
      />
    );
  }

  function renderSkipSwitch(
    step: "assignment" | "collect" | "grading",
    disabled?: boolean,
  ) {
    const { label, title, tip } = skipStepMessages(intl);
    const skipped = assignment.get(`skip_${step}` as any);
    return (
      <Tip title={title} tip={tip}>
        <Switch
          checked={!!skipped}
          onChange={() =>
            actions.assignments.set_skip(assignmentId, step, !skipped)
          }
          unCheckedChildren={label}
          checkedChildren={label}
          size="small"
          disabled={disabled}
        />
      </Tip>
    );
  }

  // Keep this order aligned with header column order; it drives "next recommended step" highlighting.
  const orderedSteps: AssignmentStep[] = peer
    ? [
        "assignment",
        "collect",
        "peer_assignment",
        "peer_collect",
        "grade",
        "return_graded",
      ]
    : ["assignment", "collect", "grade", "return_graded"];

  // For recommendation purposes, a step is "complete" only when it is done
  // for all non-deleted students, unless that step was explicitly skipped.
  function previousStepsComplete(step: AssignmentStep) {
    for (const s of orderedSteps) {
      if (s === step) break;
      if (s === "grade") {
        if (assignment.get("skip_grading")) {
          continue;
        }
        for (const studentId of store.get_student_ids({ deleted: false })) {
          if (!store.has_grade(assignmentId, studentId)) {
            return false;
          }
        }
      } else {
        if (assignment.get(`skip_${s}` as any)) {
          continue;
        }
        if (assignmentStatus[s] !== store.num_students()) {
          return false;
        }
      }
    }
    return true;
  }

  function runAllButtonType(
    step: AssignmentStep,
    hasNew: boolean,
  ): "primary" | "default" {
    const prevComplete = previousStepsComplete(step);
    if (hasNew && prevComplete) {
      return "primary";
    }
    return "default";
  }

  function isNbgraderRunning(): boolean {
    if (nbgraderRunInfo == null) return false;
    const t = nbgraderRunInfo.get(assignmentId);
    // Time starting is set and it's also within the last few minutes.
    // This "few minutes" is just in case -- we probably shouldn't need
    // that at all ever, but it could make cocalc state usable in case of
    // weird issues, I guess). User could also just close and re-open
    // the course file, which resets this state completely.
    return webapp_client.server_time() - (t ?? 0) <= 1000 * 60 * 10;
  }

  function renderNbgraderRunAll() {
    const nbgrader = nbgrader_status(assignment);
    const total = nbgrader.attempted + nbgrader.not_attempted;
    const todo = nbgrader.not_attempted + nbgrader.failed;
    const running = isNbgraderRunning();
    const showRemaining = todo > 0 && !confirmAllStudents && !confirmSyncGrades;
    const alertType =
      confirmAllStudents || confirmSyncGrades
        ? "error"
        : showRemaining
          ? "warning"
          : "success";
    const msg = nbgraderMessages(intl);
    const message = (
      <Space direction="vertical">
        <span>{msg.intro}</span>
        {showRemaining && (
          <Button
            disabled={running}
            type="primary"
            onClick={() => {
              actions.assignments.run_nbgrader_for_all_students(
                assignmentId,
                true,
              );
              setOpenedRunAll(null);
            }}
          >
            {msg.remainingButton(todo)}
          </Button>
        )}
        {nbgrader.attempted > 0 && !confirmSyncGrades && (
          <Button
            danger
            disabled={running || confirmAllStudents}
            onClick={() => {
              setConfirmAllStudents(true);
              setConfirmSyncGrades(false);
            }}
          >
            {msg.allButton(total)}
          </Button>
        )}
        {confirmAllStudents && (
          <Space direction="vertical">
            <div>{msg.confirmAllPrompt(total)}</div>
            <Space>
              <Button
                danger
                type="primary"
                disabled={running}
                onClick={() => {
                  actions.assignments.run_nbgrader_for_all_students(
                    assignmentId,
                  );
                  setOpenedRunAll(null);
                  setConfirmAllStudents(false);
                }}
              >
                {msg.confirmAllAction(total)}
              </Button>
              <Button
                onClick={() => setConfirmAllStudents(false)}
                disabled={running}
              >
                {msg.back}
              </Button>
            </Space>
          </Space>
        )}
        {!confirmAllStudents && (
          <Button
            disabled={running || confirmSyncGrades}
            onClick={() => {
              setConfirmSyncGrades(true);
              setConfirmAllStudents(false);
            }}
          >
            {msg.syncButton}
          </Button>
        )}
        {confirmSyncGrades && (
          <Space direction="vertical">
            <div>{msg.syncPrompt}</div>
            <Space>
              <Button
                danger
                type="primary"
                disabled={running}
                onClick={() => {
                  actions.assignments.set_nbgrader_scores_for_all_students({
                    assignment_id: assignmentId,
                    force: true,
                    commit: true,
                  });
                  setOpenedRunAll(null);
                }}
              >
                {msg.syncAction}
              </Button>
              <Button
                onClick={() => setConfirmSyncGrades(false)}
                disabled={running}
              >
                {msg.back}
              </Button>
            </Space>
          </Space>
        )}
      </Space>
    );
    return <Alert type={alertType} message={message} />;
  }

  function copyAssignment(
    step: AssignmentCopyStep,
    newOnly: boolean,
    overwrite: boolean = false,
  ) {
    switch (step) {
      case "assignment":
        actions.assignments.copy_assignment_to_all_students(
          assignmentId,
          newOnly,
          overwrite,
        );
        break;
      case "collect":
        actions.assignments.copy_assignment_from_all_students(
          assignmentId,
          newOnly,
        );
        break;
      case "peer_assignment":
        actions.assignments.peer_copy_to_all_students(assignmentId, newOnly);
        break;
      case "peer_collect":
        actions.assignments.peer_collect_from_all_students(
          assignmentId,
          newOnly,
        );
        break;
      case "return_graded":
        actions.assignments.return_assignment_to_all_students(
          assignmentId,
          newOnly,
        );
        break;
      default:
        console.log(`BUG -- unknown step: ${step}`);
    }
    setConfirmAllStudents(false);
    setOpenedRunAll(null);
  }

  function renderCopyConfirm(step: AssignmentCopyStep) {
    return (
      <CopyRunAllAlert
        id={`copy_confirm_${step}`}
        step={step}
        status={{
          done: assignmentStatus[step],
          not_done: assignmentStatus[`not_${step}`],
          total: numStudents,
        }}
        onRun={({ scope, overwrite }) =>
          copyAssignment(step, scope === "remaining", overwrite)
        }
        hasStudentSubdir={assignment.get("has_student_subdir")}
      />
    );
  }

  function renderGradeRunAll() {
    if (!assignment.get("nbgrader") || assignmentStatus.collect === 0) {
      return;
    }
    const nbgrader = nbgrader_status(assignment);
    if (nbgrader.attempted + nbgrader.not_attempted === 0) {
      return;
    }
    return (
      <RunAllPopover
        id="grade"
        open={openedRunAll === "grade"}
        onOpenChange={(next) => {
          setOpenedRunAll(next ? "grade" : null);
          setConfirmAllStudents(false);
          setConfirmSyncGrades(false);
        }}
        type={runAllButtonType(
          "grade",
          nbgrader.not_attempted + nbgrader.failed > 0,
        )}
        content={renderNbgraderRunAll()}
        ariaLabel={runAllAriaLabel(intl, "grade")}
      />
    );
  }

  type StepSection = {
    actions: ReactElement<any>[];
    progress?: ReactElement<any>;
  };

  function renderAssignmentSection(): StepSection {
    const actionsForStep: ReactElement<any>[] = [
      <span key="run-assignment">
        {renderStepPopover("assignment", {
          type: runAllButtonType(
            "assignment",
            assignmentStatus.not_assignment > 0,
          ),
          content: renderCopyConfirm("assignment"),
          onOpen: () => {
            actions.assignments.update_listing(assignmentId);
          },
        })}
      </span>,
    ];
    if (!peer) {
      actionsForStep.push(
        <span key="skip-assignment">{renderSkipSwitch("assignment")}</span>,
      );
    }
    return {
      actions: actionsForStep,
      progress: (
        <Progress
          key="progress-assignment"
          done={assignmentStatus.assignment}
          not_done={assignmentStatus.not_assignment}
          step="assigned"
          skipped={assignment.get("skip_assignment")}
        />
      ),
    };
  }

  function renderCollectSection(): StepSection | undefined {
    if (assignmentStatus.assignment === 0) {
      // no button if nothing ever assigned
      return;
    }
    const actionsForStep: ReactElement<any>[] = [
      <span key="run-collect">
        {renderStepPopover("collect", {
          type: runAllButtonType("collect", assignmentStatus.not_collect > 0),
          content: renderCopyConfirm("collect"),
        })}
      </span>,
    ];
    if (!peer) {
      actionsForStep.push(
        <span key="skip-collect">{renderSkipSwitch("collect")}</span>,
      );
    }
    return {
      actions: actionsForStep,
      progress: (
        <Progress
          key="progress-collect"
          done={assignmentStatus.collect}
          not_done={assignmentStatus.not_collect}
          step="collected"
          skipped={assignment.get("skip_collect")}
        />
      ),
    };
  }

  function renderPeerAssignmentSection(): StepSection | undefined {
    if (assignmentStatus.peer_assignment == null) {
      // not peer graded
      return;
    }
    if (assignmentStatus.not_collect + assignmentStatus.not_assignment > 0) {
      // collect everything before peer grading
      return;
    }
    if (assignmentStatus.collect === 0) {
      // nothing to peer assign
      return;
    }
    return {
      actions: [
        <span key="run-peer-assignment">
          {renderStepPopover("peer_assignment", {
            type: runAllButtonType(
              "peer_assignment",
              assignmentStatus.not_peer_assignment > 0,
            ),
            content: renderCopyConfirm("peer_assignment"),
          })}
        </span>,
      ],
      progress: (
        <Progress
          key="progress-peer-assignment"
          done={assignmentStatus.peer_assignment}
          not_done={assignmentStatus.not_peer_assignment}
          step="peer assigned"
        />
      ),
    };
  }

  function renderPeerCollectSection(): StepSection | undefined {
    // Render the "Peer Collect..." button in the top row, for collecting peer grading from all
    // students in the course.
    if (assignmentStatus.peer_collect == null) {
      return;
    }
    if (assignmentStatus.peer_assignment === 0) {
      // haven't even peer assigned anything -- so nothing to collect
      return;
    }
    if (assignmentStatus.not_peer_assignment > 0) {
      // everybody must have received peer assignment, or collecting isn't allowed
      return;
    }
    return {
      actions: [
        <span key="run-peer-collect">
          {renderStepPopover("peer_collect", {
            type: runAllButtonType(
              "peer_collect",
              assignmentStatus.not_peer_collect > 0,
            ),
            content: renderCopyConfirm("peer_collect"),
          })}
        </span>,
      ],
      progress: (
        <Progress
          key="progress-peer-collect"
          done={assignmentStatus.peer_collect}
          not_done={assignmentStatus.not_peer_collect}
          step="peer collected"
        />
      ),
    };
  }

  function renderReturnGradedSection(): StepSection | undefined {
    if (assignmentStatus.collect === 0) {
      // No button if nothing collected.
      return;
    }
    if (
      assignmentStatus.peer_collect != null &&
      assignmentStatus.peer_collect === 0
    ) {
      // Peer grading enabled, but we didn't collect anything yet
      return;
    }
    if (
      !assignment.get("skip_grading") &&
      assignmentStatus.not_return_graded === 0 &&
      assignmentStatus.return_graded === 0
    ) {
      // Nothing unreturned and ungraded yet and also nothing returned yet
      return;
    }
    return {
      actions: [
        <span key="run-return-graded">
          {renderStepPopover("return_graded", {
            type: runAllButtonType(
              "return_graded",
              assignmentStatus.not_return_graded > 0,
            ),
            content: renderCopyConfirm("return_graded"),
          })}
        </span>,
      ],
      progress: (
        <Progress
          key="progress-return-graded"
          done={assignmentStatus.return_graded}
          not_done={assignmentStatus.not_return_graded}
          step="returned"
        />
      ),
    };
  }

  function renderGradeSection(): StepSection | undefined {
    const actionsForStep: ReactElement<any>[] = [];
    const gradeAction = renderGradeRunAll();
    if (gradeAction) {
      actionsForStep.push(<span key="run-grade">{gradeAction}</span>);
    }
    if (assignmentStatus.collect > 0) {
      actionsForStep.push(
        <span key="skip-grade">
          {renderSkipSwitch("grading", assignmentStatus.collect === 0)}
        </span>,
      );
    }
    if (actionsForStep.length === 0) {
      return;
    }
    return { actions: actionsForStep };
  }

  function renderStepSection(
    state: AssignmentCopyStep,
  ): StepSection | undefined {
    switch (state) {
      case "collect":
        return renderCollectSection();
      case "return_graded":
        return renderReturnGradedSection();
      case "peer_assignment":
        return renderPeerAssignmentSection();
      case "peer_collect":
        return renderPeerCollectSection();
      case "assignment":
        return renderAssignmentSection();
    }
  }

  const actionsMap: Partial<Record<AssignmentStep, ReactElement<any>[]>> = {};
  const progressMap: Partial<Record<AssignmentStep, ReactElement<any>>> = {};

  for (const name of STEPS(peer)) {
    const section = renderStepSection(name);
    if (section == null) {
      continue;
    }
    actionsMap[name] = section.actions;
    if (section.progress) {
      progressMap[name] = section.progress;
    }
  }

  const gradeSection = renderGradeSection();
  if (gradeSection) {
    actionsMap.grade = gradeSection.actions;
  }

  return (
    <StudentAssignmentInfoHeader
      mode="assignment"
      peer_grade={peer}
      actions={actionsMap}
      progress={progressMap}
      filter={
        <DebounceInput
          debounceTimeout={500}
          element={Input as any}
          placeholder={filterPlaceholder(intl)}
          value={studentSearch}
          onChange={(e) => setStudentSearch(e.target.value)}
        />
      }
    />
  );
}
