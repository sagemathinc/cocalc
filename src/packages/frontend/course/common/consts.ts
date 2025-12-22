/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { defineMessage } from "react-intl";

import { CSS } from "@cocalc/frontend/app-framework";

export const SEARCH_STYLE: CSS = { marginBottom: "0px" } as const;

// this could get translated somehow...
export const DUE_DATE_FILENAME = "DUE_DATE.txt";

export const STEP_NAMES = [
  "Assign",
  "Collect",
  "Peer Assign",
  "Peer Collect",
  "Return",
] as const;

export type Steps = (typeof STEP_NAMES)[number];

// Relative width for the Grade column when using flex layouts.
export const GRADE_FLEX = "1.5";

export const STEPS_INTL = defineMessage({
  id: "course.student-assignment-info.steps",
  // string as select match does not work, this is the index in the STEPS array
  defaultMessage: `{step, select,
    0 {Assign}
    1 {Collect}
    2 {Peer Assign}
    3 {Peer Collect}
    4 {Return}
    other {Unknown}
  }`,
  description:
    "Label on a button, indicating the operation on files for a student in an online course.",
});

export const STEPS_INTL_ACTIVE = defineMessage({
  id: "course.student-assignment-info.steps.active",
  defaultMessage: `{step, select,
    0 {Assigning}
    1 {Collecting}
    2 {Peer Assigning}
    3 {Peer Collecting}
    4 {Returning}
    other {Unknown}
  }`,
  description:
    "Label on a button, indicating the active operation on files for a student in an online course.",
});
