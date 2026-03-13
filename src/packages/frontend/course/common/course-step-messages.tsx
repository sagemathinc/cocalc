/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import type { IntlShape } from "react-intl";

import { unreachable } from "@cocalc/util/misc";

import type { AssignmentStep, CopyStep } from "../types";

export function actionsLegend(intl: IntlShape): string {
  return intl.formatMessage({
    id: "course.student-assignment-info-header.actions_legend",
    defaultMessage: "Actions",
    description:
      "Section title in the column info popover for explaining action icons",
  });
}

export function columnInfoAria(intl: IntlShape, title: string): string {
  return intl.formatMessage(
    {
      id: "course.student-assignment-info-header.column_info.aria_label",
      defaultMessage: "Column info: {title}",
      description:
        "Aria label for the info popover trigger button in a course workflow column header",
    },
    { title },
  );
}

const runAllDescription =
  "Legend text in the column info popover: run this workflow step for all eligible students";
const runOneDescription =
  "Legend text in the column info popover: run this workflow step for one student";
const redoOneDescription =
  "Legend text in the column info popover: run this workflow step again for one student";
const openOneDescription =
  "Legend text in the column info popover: open this student's files for this workflow step";
const skipInfoDescription =
  "Legend text in the column info popover: allow skipping this workflow step for run-all flow";
const editOneDescription =
  "Legend text in the column info popover: edit grade and comments for one student";
const infoTitleDescription = "Title of a column info popover";

export function columnLabel(intl: IntlShape, key: AssignmentStep): string {
  switch (key) {
    case "assignment":
      return intl.formatMessage({
        id: "course.student-assignment-info-header.assign.label",
        defaultMessage: "Assign",
        description:
          "Column title in course workflow table. Use a short verb meaning 'assign to students'. Prefer verb/action wording, not a noun.",
      });
    case "distribution":
      return intl.formatMessage({
        id: "course.handouts.distribute.label",
        defaultMessage: "Distribute",
        description:
          "Column title in handout workflow table. Use a short verb meaning 'distribute handout to students'. Prefer verb/action wording, not a noun.",
      });
    case "collect":
      return intl.formatMessage({
        id: "course.student-assignment-info-header.collect.label",
        defaultMessage: "Collect",
        description:
          "Column title in course workflow table. Use a short verb meaning 'collect student work'. Prefer verb/action wording, not a noun.",
      });
    case "grade":
      return intl.formatMessage({
        id: "course.student-assignment-info-header.grade.label",
        defaultMessage: "Grade",
        description:
          "Column title in course workflow table. Use a short verb meaning 'grade submissions'. Prefer verb/action wording, not a noun.",
      });
    case "peer_assignment":
      return intl.formatMessage({
        id: "course.student-assignment-info-header.peer_assignment.label",
        defaultMessage: "Peer Assign",
        description:
          "Column title in peer-grading workflow. Use a short verb phrase meaning 'assign for peer grading'. Prefer verb/action wording, not a noun.",
      });
    case "peer_collect":
      return intl.formatMessage({
        id: "course.student-assignment-info-header.peer_collect.label",
        defaultMessage: "Peer Collect",
        description:
          "Column title in peer-grading workflow. Use a short verb phrase meaning 'collect peer feedback'. Prefer verb/action wording, not a noun.",
      });
    case "return_graded":
      return intl.formatMessage({
        id: "course.student-assignment-info-header.return.label",
        defaultMessage: "Return",
        description:
          "Column title in course workflow table. Use a short verb meaning 'return graded work to students'. Prefer verb/action wording, not a noun.",
      });
    default:
      unreachable(key);
      return "";
  }
}

export function copyStepMsg(intl: IntlShape, key: CopyStep) {
  switch (key) {
    case "assignment":
      return {
        title: intl.formatMessage({
          id: "course.student-assignment-info-header.assign.info_title",
          defaultMessage: "Assign: From Instructor to Students",
          description: infoTitleDescription,
        }),
        tip: intl.formatMessage({
          id: "course.student-assignment-info-header.assign.tooltip",
          defaultMessage:
            "Copy all assignment files from your project to each student's project, creating independent copies.",
        }),
        actions: actionsLegend(intl),
        runAll: intl.formatMessage({
          id: "course.student-assignment-info-header.assign.run_all",
          defaultMessage: "Assign to all students",
          description: runAllDescription,
        }),
        skipInfo: intl.formatMessage({
          id: "course.student-assignment-info-header.assign.skip_info",
          defaultMessage: "Allow proceeding without assigning",
          description: skipInfoDescription,
        }),
        runOne: intl.formatMessage({
          id: "course.student-assignment-info-header.assign.run_one",
          defaultMessage: "Assign to this student",
          description: runOneDescription,
        }),
        redoOne: intl.formatMessage({
          id: "course.student-assignment-info-header.assign.redo_one",
          defaultMessage: "Assign again to this student",
          description: redoOneDescription,
        }),
        openOne: intl.formatMessage({
          id: "course.student-assignment-info-header.assign.open_one",
          defaultMessage: "Open the student's copy in the student's project",
          description: openOneDescription,
        }),
      };
    case "distribution":
      return {
        title: intl.formatMessage({
          id: "course.student-assignment-info-header.distribute.info_title",
          defaultMessage: "Distribute: From Instructor to Students",
          description: infoTitleDescription,
        }),
        tip: intl.formatMessage({
          id: "course.handouts.distribute.tooltip",
          defaultMessage:
            "Copy all handout files from your project to each student's project, creating independent copies.",
        }),
        actions: actionsLegend(intl),
        runAll: intl.formatMessage({
          id: "course.student-assignment-info-header.distribute.run_all",
          defaultMessage: "Distribute to all students",
          description: runAllDescription,
        }),
        runOne: intl.formatMessage({
          id: "course.student-assignment-info-header.distribute.run_one",
          defaultMessage: "Distribute to this student",
          description: runOneDescription,
        }),
        redoOne: intl.formatMessage({
          id: "course.student-assignment-info-header.distribute.redo_one",
          defaultMessage: "Distribute again to this student",
          description: redoOneDescription,
        }),
        openOne: intl.formatMessage({
          id: "course.student-assignment-info-header.distribute.open_one",
          defaultMessage:
            "Open the student's copy of this handout in their project",
          description: openOneDescription,
        }),
      };
    case "collect":
      return {
        title: intl.formatMessage({
          id: "course.student-assignment-info-header.collect.info_title",
          defaultMessage: "Collect: From Students to Instructor",
          description: infoTitleDescription,
        }),
        tip: intl.formatMessage({
          id: "course.student-assignment-info-header.collect.tooltip",
          defaultMessage:
            "Copy all assignment files from each student's project to your project, in their current state. Students can keep editing their copies. New changes will appear in your project only if you collect again.",
        }),
        actions: actionsLegend(intl),
        runAll: intl.formatMessage({
          id: "course.student-assignment-info-header.collect.run_all",
          defaultMessage: "Collect from all students",
          description: runAllDescription,
        }),
        skipInfo: intl.formatMessage({
          id: "course.student-assignment-info-header.collect.skip_info",
          defaultMessage: "Allow proceeding without collecting",
          description: skipInfoDescription,
        }),
        runOne: intl.formatMessage({
          id: "course.student-assignment-info-header.collect.run_one",
          defaultMessage: "Collect from this student",
          description: runOneDescription,
        }),
        redoOne: intl.formatMessage({
          id: "course.student-assignment-info-header.collect.redo_one",
          defaultMessage: "Collect again from this student",
          description: redoOneDescription,
        }),
        openOne: intl.formatMessage({
          id: "course.student-assignment-info-header.collect.open_one",
          defaultMessage: "Open this student's collected work in your project",
          description: openOneDescription,
        }),
      };
    case "peer_assignment":
      return {
        title: intl.formatMessage({
          id: "course.student-assignment-info-header.peer_assign.info_title",
          defaultMessage: "Peer Assign: From Instructor to Peer Graders",
          description: infoTitleDescription,
        }),
        tip: intl.formatMessage(
          {
            id: "course.student-assignment-info-header.peer_assignment.tooltip",
            defaultMessage:
              "Distribute collected submissions for peer grading: each submission is copied to {count} randomly selected peer graders, where {count} is set in Peer Grading. You must complete Collect step for all students first.",
            description: "Peer Assign tooltip text in column info popover",
          },
          {
            count: "N",
          },
        ),
        actions: actionsLegend(intl),
        runAll: intl.formatMessage({
          id: "course.student-assignment-info-header.peer_assign.run_all",
          defaultMessage: "Peer assign for all students",
          description: runAllDescription,
        }),
        runOne: intl.formatMessage({
          id: "course.student-assignment-info-header.peer_assign.run_one",
          defaultMessage: "Peer assign for this student",
          description: runOneDescription,
        }),
        redoOne: intl.formatMessage({
          id: "course.student-assignment-info-header.peer_assign.redo_one",
          defaultMessage: "Peer assign again for this student",
          description: redoOneDescription,
        }),
        openOne: intl.formatMessage({
          id: "course.student-assignment-info-header.peer_assign.open_one",
          defaultMessage:
            "Open the student's peer-grading copy in their project",
          description: openOneDescription,
        }),
      };
    case "peer_collect":
      return {
        title: intl.formatMessage({
          id: "course.student-assignment-info-header.peer_collect.info_title",
          defaultMessage: "Peer Collect: From Peer Graders to Instructor",
          description: infoTitleDescription,
        }),
        tip: intl.formatMessage({
          id: "course.student-assignment-info-header.peer_collect.tooltip",
          defaultMessage:
            "Copy peer-graded submissions with peer feedback from student projects to your project. You must complete Peer Assign step for all students first.",
        }),
        actions: actionsLegend(intl),
        runAll: intl.formatMessage({
          id: "course.student-assignment-info-header.peer_collect.run_all",
          defaultMessage: "Peer collect for all students",
          description: runAllDescription,
        }),
        runOne: intl.formatMessage({
          id: "course.student-assignment-info-header.peer_collect.run_one",
          defaultMessage: "Peer collect for this student",
          description: runOneDescription,
        }),
        redoOne: intl.formatMessage({
          id: "course.student-assignment-info-header.peer_collect.redo_one",
          defaultMessage: "Peer collect again for this student",
          description: redoOneDescription,
        }),
        openOne: intl.formatMessage({
          id: "course.student-assignment-info-header.peer_collect.open_one",
          defaultMessage:
            "Open this student's collected peer grading in your project",
          description: openOneDescription,
        }),
      };
    case "return_graded":
      return {
        title: intl.formatMessage({
          id: "course.student-assignment-info-header.return.info_title",
          defaultMessage: "Return: From Instructor to Students",
          description: infoTitleDescription,
        }),
        tip: intl.formatMessage({
          id: "course.student-assignment-info-header.return.tooltip",
          defaultMessage:
            "Copy grades, comments, and assignment files with feedback from your project to student projects.",
        }),
        actions: actionsLegend(intl),
        runAll: intl.formatMessage({
          id: "course.student-assignment-info-header.return.run_all",
          defaultMessage: "Return to all students",
          description: runAllDescription,
        }),
        runOne: intl.formatMessage({
          id: "course.student-assignment-info-header.return.run_one",
          defaultMessage: "Return to this student",
          description: runOneDescription,
        }),
        redoOne: intl.formatMessage({
          id: "course.student-assignment-info-header.return.redo_one",
          defaultMessage: "Return again to this student",
          description: redoOneDescription,
        }),
        openOne: intl.formatMessage({
          id: "course.student-assignment-info-header.return.open_one",
          defaultMessage: "Open the returned copy in the student's project",
          description: openOneDescription,
        }),
      };
    default:
      unreachable(key);
      return undefined as never;
  }
}

export function gradeMsg(intl: IntlShape) {
  return {
    title: intl.formatMessage({
      id: "course.student-assignment-info-header.grade.info_title",
      defaultMessage: "Grade: Scores & Comments",
      description: infoTitleDescription,
    }),
    tip: intl.formatMessage({
      id: "course.student-assignment-info-header.grade.tooltip",
      defaultMessage:
        "Record the student's grade and comments for this assignment. The grade can be either numeric or text.",
    }),
    actions: actionsLegend(intl),
    runnbgrader: intl.formatMessage(
      {
        id: "course.student-assignment-info-header.grade.run_automated_full",
        defaultMessage:
          "Run <docLink>automated grading</docLink> for all students (if available)",
        description: "Grade popover action line with link to nbgrader docs",
      },
      {
        docLink: (chunks) => (
          <a
            href="https://doc.cocalc.com/teaching-nbgrader.html"
            target="_blank"
            rel="noopener noreferrer"
          >
            {chunks}
          </a>
        ),
      },
    ),
    skipInfo: intl.formatMessage({
      id: "course.student-assignment-info-header.grade.skip_info",
      defaultMessage: "Allow proceeding without grading",
      description: skipInfoDescription,
    }),
    editOne: intl.formatMessage({
      id: "course.student-assignment-info-header.grade.edit_one",
      defaultMessage: "Edit grade and comments for this student",
      description: editOneDescription,
    }),
  };
}
