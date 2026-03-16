/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { ReactNode } from "react";
import type { IntlShape } from "react-intl";

import { labels } from "@cocalc/frontend/i18n";

import type { AssignmentCopyStep, AssignmentStep } from "../types";

export type UnitLabel = "assignment" | "handout";

interface ControlMessages {
  label: string;
  title: string;
  tip: string;
}

interface DeleteConfirmMessages {
  title: string;
  body: string;
}

interface NoContentMessages {
  message: string;
  description: (openDirLink: (chunks: ReactNode) => ReactNode) => ReactNode;
}

export function openFolderMessages(
  intl: IntlShape,
  unitLabel: UnitLabel,
): ControlMessages {
  return {
    label: intl.formatMessage(labels.open),
    title: intl.formatMessage({
      id: "course.unit_strings.open_folder.title",
      defaultMessage: "Open Folder",
    }),
    tip:
      unitLabel === "assignment"
        ? intl.formatMessage({
            id: "course.unit_strings.open_folder.tip.assignment",
            defaultMessage:
              "Open the directory in the current project that contains the original files for this assignment. Edit files in this folder to create the content that your students will see when they receive this assignment.",
          })
        : intl.formatMessage({
            id: "course.unit_strings.open_folder.tip.handout",
            defaultMessage:
              "Open the directory in the current project that contains the original files for this handout. Edit files in this folder to create the content that your students will see when they receive this handout.",
          }),
  };
}

export function fileActivityMessages(
  intl: IntlShape,
  unitLabel: UnitLabel,
): ControlMessages {
  return {
    label: intl.formatMessage({
      id: "course.unit_strings.file_activity.label",
      defaultMessage: "File Activity",
    }),
    title: intl.formatMessage({
      id: "course.unit_strings.file_activity.title",
      defaultMessage: "Export File Activity Data",
    }),
    tip: intl.formatMessage(
      {
        id: "course.unit_strings.file_activity.tip",
        defaultMessage:
          "Export a JSON file containing detailed information about when students have opened or edited files in this {unitLabel, select, assignment {assignment} other {handout}}. The JSON file opens in a new tab; {accessField} (milliseconds since the UNIX epoch) indicate when files were opened, and {editField} indicate when they were changed in CoCalc's web editor.",
        description:
          "{accessField} and {editField} are literal JSON field names and should not be translated. {unitLabel} is 'assignment' or 'handout'.",
      },
      {
        unitLabel,
        accessField: "access_times",
        editField: "edit_times",
      },
    ),
  };
}

export function exportCollectedMessages(intl: IntlShape): ControlMessages {
  return {
    label: intl.formatMessage({
      id: "course.unit_strings.export.label",
      defaultMessage: "Export",
      description:
        "Button label in assignment header; exports collected student files as a zip archive",
    }),
    title: intl.formatMessage({
      id: "course.unit_strings.export_collected.title",
      defaultMessage: "Export Collected Files",
    }),
    tip: intl.formatMessage({
      id: "course.unit_strings.export_collected.tip",
      defaultMessage:
        "Export a zip file containing all collected student assignments. This may take a while for large classes.",
    }),
  };
}

export function undeleteMessages(
  intl: IntlShape,
  unitLabel: UnitLabel,
): ControlMessages {
  return {
    label: intl.formatMessage({
      id: "course.unit_strings.undelete.label",
      defaultMessage: "Undelete",
      description:
        "Button label in course unit header; restores a previously deleted assignment or handout",
    }),
    title:
      unitLabel === "assignment"
        ? intl.formatMessage({
            id: "course.unit_strings.undelete.title.assignment",
            defaultMessage: "Undelete Assignment",
          })
        : intl.formatMessage({
            id: "course.unit_strings.undelete.title.handout",
            defaultMessage: "Undelete Handout",
          }),
    tip:
      unitLabel === "assignment"
        ? intl.formatMessage({
            id: "course.unit_strings.undelete.tip.assignment",
            defaultMessage:
              "Make the assignment visible again in the assignment list and in student grade lists.",
          })
        : intl.formatMessage({
            id: "course.unit_strings.undelete.tip.handout",
            defaultMessage:
              "Make the handout visible again in the handout list.",
          }),
  };
}

export function deleteConfirmMessages(
  intl: IntlShape,
  unitLabel: UnitLabel,
  path: string,
): DeleteConfirmMessages {
  return {
    title: intl.formatMessage(
      {
        id: "course.unit_strings.delete_confirm.title",
        defaultMessage: 'Are you sure you want to delete "{path}"?',
      },
      { path },
    ),
    body:
      unitLabel === "assignment"
        ? intl.formatMessage({
            id: "course.unit_strings.delete_confirm.body.assignment",
            defaultMessage:
              'This removes it from the assignment list and student grade lists, but does not delete any files from disk. You can always undelete it later by clicking "Show deleted assignments".',
          })
        : intl.formatMessage({
            id: "course.unit_strings.delete_confirm.body.handout",
            defaultMessage:
              'This removes it from the handout list, but does not delete any files from disk. You can always undelete it later by clicking "Show deleted handouts".',
          }),
  };
}

export function deleteLabel(intl: IntlShape): string {
  return intl.formatMessage({
    id: "course.unit_strings.delete.label",
    defaultMessage: "Delete...",
    description:
      "Button label in course unit header; opens confirmation to remove assignment or handout from the list",
  });
}

export function dueDateMessages(intl: IntlShape): ControlMessages {
  return {
    label: intl.formatMessage({
      id: "course.unit_strings.due.label",
      defaultMessage: "Due:",
      description:
        "Inline label before the due date/time picker in unit header",
    }),
    title: intl.formatMessage({
      id: "course.unit_strings.due_date.title",
      defaultMessage: "Due Date",
      description: "Tooltip title for the due date/time picker in unit header",
    }),
    tip: intl.formatMessage(
      {
        id: "course.unit_strings.due_date.tip",
        defaultMessage:
          "Set the due date for this assignment. This changes how assignments are sorted. Assignments are not automatically collected when due; you must collect them explicitly. CoCalc also writes the due date to {dueDateFile} in the assignment folder.",
        description:
          "{dueDateFile} is a literal filename and should not be translated",
      },
      { dueDateFile: "DUE_DATE.txt" },
    ),
  };
}

export function skipStepMessages(intl: IntlShape): ControlMessages {
  return {
    label: intl.formatMessage({
      id: "course.unit_strings.skip_step.label",
      defaultMessage: "Skip",
      description: "Short label shown on the skip toggle in step headers",
    }),
    title: intl.formatMessage({
      id: "course.unit_strings.skip_step.title",
      defaultMessage: "Skip This Step",
      description: "Tooltip title for the skip toggle in step headers",
    }),
    tip: intl.formatMessage({
      id: "course.unit_strings.skip_step.tip",
      defaultMessage:
        "Toggle to allow proceeding to the next step without completing this one.",
    }),
  };
}

export function filterPlaceholder(intl: IntlShape): string {
  return intl.formatMessage({
    id: "course.unit_strings.filter_students.placeholder",
    defaultMessage: "Filter students...",
    description:
      "Placeholder text in input used to filter the student list by name",
  });
}

export function noteMessages(intl: IntlShape, unitLabel: UnitLabel) {
  return {
    title:
      unitLabel === "assignment"
        ? intl.formatMessage({
            id: "course.assignments.assignment_notes.tooltip.title",
            defaultMessage: "Notes about this assignment",
          })
        : intl.formatMessage({
            id: "course.handouts.handout_notes.tooltip.title",
            defaultMessage: "Notes about this handout",
          }),
    tip:
      unitLabel === "assignment"
        ? intl.formatMessage({
            id: "course.assignments.assignment_notes.tooltip.tooltip",
            defaultMessage: `Record notes about this assignment here.
These notes are only visible to you, not to your students.
Put any instructions to students about assignments in a file in the directory
that contains the assignment.`,
          })
        : intl.formatMessage({
            id: "course.handouts.handout_notes.tooltip.tooltip",
            defaultMessage: `Record notes about this handout here.
These notes are only visible to you, not to your students.
Put any instructions to students about handouts in a file in the directory
that contains the handout.`,
          }),
    placeholder:
      unitLabel === "assignment"
        ? intl.formatMessage({
            id: "course.assignments.assignment_notes.placeholder",
            defaultMessage:
              "Private notes about this assignment (not visible to students)",
          })
        : intl.formatMessage({
            id: "course.handouts.handout_notes.placeholder",
            defaultMessage:
              "Private notes about this handout (not visible to students)",
          }),
  };
}

export function noContentMessages(
  intl: IntlShape,
  unitLabel: UnitLabel,
): NoContentMessages {
  return {
    message:
      unitLabel === "assignment"
        ? intl.formatMessage({
            id: "course.unit_strings.no_content.message.assignment",
            defaultMessage: "No files in this assignment yet",
            description:
              "Warning message in assignment card when assignment directory has no files",
          })
        : intl.formatMessage({
            id: "course.unit_strings.no_content.message.handout",
            defaultMessage: "No files in this handout yet",
            description:
              "Warning message in handout card when handout directory has no files",
          }),
    description: (openDirLink) =>
      unitLabel === "assignment"
        ? intl.formatMessage(
            {
              id: "course.unit_strings.no_content.description.assignment",
              defaultMessage:
                "Please <openDirLink>open the directory</openDirLink> for this assignment, then create, upload, or copy any content you want into that directory. You will then be able to send it to all of your students.",
              description:
                "Warning description in assignment card when assignment directory has no files",
            },
            { openDirLink },
          )
        : intl.formatMessage(
            {
              id: "course.unit_strings.no_content.description.handout",
              defaultMessage:
                "Please <openDirLink>open the directory</openDirLink> for this handout, then create, upload, or copy any content you want into that directory. You will then be able to send it to all of your students.",
              description:
                "Warning description in handout card when handout directory has no files",
            },
            { openDirLink },
          ),
  };
}

export function runAllAriaLabel(intl: IntlShape, step: AssignmentStep): string {
  switch (step) {
    case "assignment":
      return intl.formatMessage({
        id: "course.run_all.aria.assignment",
        defaultMessage: "Assign to all students options",
      });
    case "collect":
      return intl.formatMessage({
        id: "course.run_all.aria.collect",
        defaultMessage: "Collect from all students options",
      });
    case "peer_assignment":
      return intl.formatMessage({
        id: "course.run_all.aria.peer_assignment",
        defaultMessage: "Assign for peer grading options",
      });
    case "peer_collect":
      return intl.formatMessage({
        id: "course.run_all.aria.peer_collect",
        defaultMessage: "Collect peer feedback options",
      });
    case "return_graded":
      return intl.formatMessage({
        id: "course.run_all.aria.return_graded",
        defaultMessage: "Return to all students options",
      });
    case "grade":
      return intl.formatMessage({
        id: "course.run_all.aria.grade",
        defaultMessage: "Autograde options",
      });
    case "distribution":
      return intl.formatMessage({
        id: "course.run_all.aria.distribution",
        defaultMessage: "Distribute to all students options",
      });
    default:
      return intl.formatMessage({
        id: "course.run_all.aria.default",
        defaultMessage: "Run all options",
      });
  }
}

export function peerGradingMessages(intl: IntlShape) {
  return {
    label: intl.formatMessage({
      id: "course.unit_strings.peer_grading.label",
      defaultMessage: "Peer Grading...",
      description: "Button label in assignment header to configure peer grading",
    }),
    disabledTooltip: intl.formatMessage(
      {
        id: "course.unit_strings.peer_disabled.tooltip",
        defaultMessage:
          "Peer grading is disabled because {pkg} notebooks were detected",
        description: "{pkg} is a package name and should not be translated",
      },
      { pkg: "nbgrader" },
    ),
    disabledAlert: intl.formatMessage(
      {
        id: "course.unit_strings.peer_disabled.alert",
        defaultMessage:
          "Peer grading was disabled because {pkg} notebooks were detected. Remove {pkg} metadata to re-enable peer grading.",
        description: "{pkg} is a package name and should not be translated",
      },
      { pkg: "nbgrader" },
    ),
  };
}

export function copyConfirmAllCaution(
  intl: IntlShape,
  step: AssignmentCopyStep,
): ReactNode {
  switch (step) {
    case "assignment":
      return intl.formatMessage(
        {
          id: "course.unit_strings.copy_confirm_all.assignment",
          defaultMessage:
            'CAUTION: All files will be copied again. If you updated a file that a student has also worked on, it will get copied to a backup file ending in a tilde (~), or possibly only be available in snapshots. Select "Replace student files!" if you do <b>not</b> want to create any backups and want to <b>delete</b> all other files in the assignment folder of student projects. <detailsLink>Details</detailsLink>',
          description:
            "Warning shown before recopying assignment files for all students",
        },
        {
          b: (chunks) => <b>{chunks}</b>,
          detailsLink: (chunks) => (
            <a
              rel="noopener noreferrer"
              target="_blank"
              href="https://doc.cocalc.com/teaching-tips_and_tricks.html#how-exactly-are-assignments-copied-to-students"
            >
              {chunks}
            </a>
          ),
        },
      );
    case "collect":
    case "peer_collect":
      return intl.formatMessage({
        id: "course.unit_strings.copy_confirm_all.collect",
        defaultMessage:
          "CAUTION: All files will be copied again. If you have graded or edited a file that a student has updated, it will get copied to a backup file ending in a tilde (~), or possibly only be available in snapshots.",
      });
    case "peer_assignment":
      return intl.formatMessage({
        id: "course.unit_strings.copy_confirm_all.peer_assignment",
        defaultMessage:
          "CAUTION: All files will be copied again. If a student worked on a previously assigned file, it will get copied to a backup file ending in a tilde (~), or possibly only be available in snapshots.",
      });
    case "return_graded":
      return intl.formatMessage({
        id: "course.unit_strings.copy_confirm_all.return_graded",
        defaultMessage:
          "CAUTION: All files will be copied again. If a student edited a previously returned file, it will get copied to a backup file ending in a tilde (~), or possibly only be available in snapshots.",
      });
  }
}

export function handoutCopyConfirmAllCaution(intl: IntlShape): string {
  return intl.formatMessage({
    id: "course.unit_strings.copy_confirm_all.handout",
    defaultMessage:
      'This will copy all files to all students again. CAUTION: if you update a file that a student has also worked on, their work will get copied to a backup file ending in a tilde, or possibly only be available in snapshots. Select "Replace student files!" if you do not want to create any backups and also delete all other files in the handout directory of their projects.',
  });
}

export function nbgraderMessages(intl: IntlShape) {
  return {
    intro: intl.formatMessage(
      {
        id: "course.unit_strings.nbgrader_run_all.intro",
        defaultMessage: "Autograde this assignment using {pkg} for",
        description:
          "{pkg} is a package name and should not be translated. This phrase is followed by a button label like 'The 5 students not yet autograded'.",
      },
      {
        pkg: "nbgrader",
      },
    ),
    remainingButton: (todo: number) =>
      intl.formatMessage(
        {
          id: "course.unit_strings.nbgrader_run_all.remaining",
          defaultMessage:
            "The {count, plural, one {# student not yet autograded} other {# students not yet autograded}}",
        },
        { count: todo },
      ),
    allButton: (total: number) =>
      intl.formatMessage(
        {
          id: "course.unit_strings.nbgrader_run_all.all_button",
          defaultMessage:
            "All {count, plural, one {# student} other {# students}}...",
        },
        { count: total },
      ),
    confirmAllPrompt: (total: number) =>
      intl.formatMessage(
        {
          id: "course.unit_strings.nbgrader_run_all.confirm_prompt",
          defaultMessage:
            "Are you sure you want to autograde ALL {count, plural, one {# student} other {# students}}?",
        },
        { count: total },
      ),
    confirmAllAction: (total: number) =>
      intl.formatMessage(
        {
          id: "course.unit_strings.nbgrader_run_all.confirm_action",
          defaultMessage:
            "Autograde all {count, plural, one {# student} other {# students}}",
        },
        { count: total },
      ),
    syncButton: intl.formatMessage({
      id: "course.unit_strings.nbgrader_run_all.sync_button",
      defaultMessage: "Sync grades...",
      description:
        "Button label in nbgrader run-all popover; opens confirmation to sync nbgrader scores into assigned grades for all students",
    }),
    syncPrompt: intl.formatMessage(
      {
        id: "course.unit_strings.nbgrader_run_all.sync_prompt",
        defaultMessage:
          "Force-sync {pkg} scores to assigned grades for all students, including submissions with ungraded manual items or errors?",
        description: "{pkg} is a package name and should not be translated",
      },
      {
        pkg: "nbgrader",
      },
    ),
    syncAction: intl.formatMessage({
      id: "course.unit_strings.nbgrader_run_all.sync_action",
      defaultMessage: "Sync grades for all students",
    }),
    back: intl.formatMessage({
      id: "course.unit_strings.nbgrader_run_all.back",
      defaultMessage: "Back",
      description:
        "Button label in nbgrader run-all popover; returns from confirmation view to previous options",
    }),
  };
}
