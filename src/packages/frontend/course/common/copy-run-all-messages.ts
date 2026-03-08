/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import type { IntlShape } from "react-intl";

import type { CopyStep } from "../types";

export function runAllIntro(intl: IntlShape, step: CopyStep): string {
  const description =
    "Intro line in the run-all popover; this text is immediately followed by a button label like 'All 23 students'";
  switch (step) {
    case "assignment":
      return intl.formatMessage({
        id: "course.copy-run-all.assign.intro",
        defaultMessage: "Assign this assignment to",
        description,
      });
    case "distribution":
      return intl.formatMessage({
        id: "course.copy-run-all.distribute.intro",
        defaultMessage: "Distribute this handout to",
        description,
      });
    case "collect":
      return intl.formatMessage({
        id: "course.copy-run-all.collect.intro",
        defaultMessage: "Collect this assignment from",
        description,
      });
    case "peer_assignment":
      return intl.formatMessage({
        id: "course.copy-run-all.peer_assign.intro",
        defaultMessage: "Assign for peer grading to",
        description,
      });
    case "peer_collect":
      return intl.formatMessage({
        id: "course.copy-run-all.peer_collect.intro",
        defaultMessage: "Collect peer feedback from",
        description,
      });
    case "return_graded":
      return intl.formatMessage({
        id: "course.copy-run-all.return.intro",
        defaultMessage: "Return this assignment to",
        description,
      });
  }
}

export function remainingStudents(
  intl: IntlShape,
  step: CopyStep,
  count: number,
): string {
  const description =
    "Button label in run-all dialog; continues the intro phrase above and includes a student count";
  switch (step) {
    case "assignment":
      return intl.formatMessage(
        {
          id: "course.copy-run-all.assign.remaining",
          defaultMessage:
            "The {count, plural, one {# student not already assigned} other {# students not already assigned}}",
          description,
        },
        { count },
      );
    case "distribution":
      return intl.formatMessage(
        {
          id: "course.copy-run-all.distribute.remaining",
          defaultMessage:
            "The {count, plural, one {# student not already distributed} other {# students not already distributed}}",
          description,
        },
        { count },
      );
    case "collect":
      return intl.formatMessage(
        {
          id: "course.copy-run-all.collect.remaining",
          defaultMessage:
            "The {count, plural, one {# student not already collected} other {# students not already collected}}",
          description,
        },
        { count },
      );
    case "peer_assignment":
      return intl.formatMessage(
        {
          id: "course.copy-run-all.peer_assign.remaining",
          defaultMessage:
            "The {count, plural, one {# student not yet assigned for peer grading} other {# students not yet assigned for peer grading}}",
          description,
        },
        { count },
      );
    case "peer_collect":
      return intl.formatMessage(
        {
          id: "course.copy-run-all.peer_collect.remaining",
          defaultMessage:
            "The {count, plural, one {# student not yet peer-collected} other {# students not yet peer-collected}}",
          description,
        },
        { count },
      );
    case "return_graded":
      return intl.formatMessage(
        {
          id: "course.copy-run-all.return.remaining",
          defaultMessage:
            "The {count, plural, one {# student not already returned} other {# students not already returned}}",
          description,
        },
        { count },
      );
  }
}

export function allStudents(
  intl: IntlShape,
  step: CopyStep,
  count: number,
): string {
  const description =
    "Button label in run-all dialog; continues the intro phrase above and includes a student count";
  switch (step) {
    case "assignment":
    case "distribution":
      return intl.formatMessage(
        {
          id: "course.copy-run-all.all.to",
          defaultMessage:
            "All {count, plural, one {# student} other {# students}}",
          description,
        },
        { count },
      );
    case "collect":
      return intl.formatMessage(
        {
          id: "course.copy-run-all.all.from_collect",
          defaultMessage:
            "All {count, plural, one {# student who has already received it} other {# students who have already received it}}",
          description,
        },
        { count },
      );
    case "peer_assignment":
      return intl.formatMessage(
        {
          id: "course.copy-run-all.all.peer_assignment",
          defaultMessage:
            "All {count, plural, one {# student for peer grading} other {# students for peer grading}}",
          description,
        },
        { count },
      );
    case "peer_collect":
      return intl.formatMessage(
        {
          id: "course.copy-run-all.all.peer_collect",
          defaultMessage:
            "All {count, plural, one {# student who should have peer graded it} other {# students who should have peer graded it}}",
          description,
        },
        { count },
      );
    case "return_graded":
      return intl.formatMessage(
        {
          id: "course.copy-run-all.all.return",
          defaultMessage:
            "All {count, plural, one {# student whose work you have graded} other {# students whose work you have graded}}",
          description,
        },
        { count },
      );
  }
}

export function commonMsgs(intl: IntlShape, overwriteToken: string) {
  return {
    typeOverwrite: intl.formatMessage(
      {
        id: "course.copy-run-all.type_overwrite",
        defaultMessage:
          'Type "{token}" in the box below if you are sure you want to overwrite any work the students may have done.',
        description:
          "Prompt in dangerous overwrite flow: user must type literal confirmation token to confirm replacing student files",
      },
      {
        token: overwriteToken,
      },
    ),
    confirmWithoutBackup: intl.formatMessage({
      id: "course.copy-run-all.confirm_without_backup",
      defaultMessage: "Confirm replacing files",
      description:
        "Final dangerous confirmation button label after typing the required confirmation token",
    }),
    withBackup: intl.formatMessage({
      id: "course.copy-run-all.with_backup",
      defaultMessage: "Yes, do it (with backup)",
      description:
        "Safer confirmation button: run copy for all and keep backups of overwritten files",
    }),
    withoutBackup: intl.formatMessage({
      id: "course.copy-run-all.without_backup",
      defaultMessage: "Replace student files!",
      description:
        "Dangerous button label that opens overwrite confirmation flow without backups",
    }),
    back: intl.formatMessage({
      id: "course.copy-run-all.back",
      defaultMessage: "Back",
      description: "Back button in run-all confirmation dialogs",
    }),
    studentSubdirInfo: intl.formatMessage(
      {
        id: "course.copy-run-all.assignment.student_subdir",
        defaultMessage:
          "Only the {subdir} subdirectory will be copied to the students.",
        description:
          "Info message in assignment run-all popover; {subdir} is a literal directory name and should not be translated",
      },
      {
        subdir: "student/",
      },
    ),
    nbgraderDocs: intl.formatMessage(
      {
        id: "course.copy-run-all.docs.nbgrader",
        defaultMessage: "{pkg} docs",
        description:
          "Link label to package documentation; {pkg} is a package name and should not be translated",
      },
      {
        pkg: "nbgrader",
      },
    ),
  };
}
