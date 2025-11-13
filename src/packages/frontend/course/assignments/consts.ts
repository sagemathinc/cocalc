/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

export const STUDENT_SUBDIR = "student";

// default timeout of 1 minute per cell
export const NBGRADER_CELL_TIMEOUT_MS: number = 60 * 1000;
// default timeout of 10 minutes for whole notebook
export const NBGRADER_TIMEOUT_MS: number = 10 * 60 * 1000;

// default max output of 1 million characters per cell
export const NBGRADER_MAX_OUTPUT_PER_CELL: number = 500000;
// default max output of 4 million characters for whole notebook
export const NBGRADER_MAX_OUTPUT: number = 4000000;

// filename of the peer grading guide
export const PEER_GRADING_GUIDE_FILENAME = "GRADING-GUIDE.md";

// Everything from GRADING_GUIDELINES_GRADE_MARKER to GRADING_GUIDELINES_COMMENT_MARKER
// is parsed as a numerical grade, if possible.  i18n's don't mess this up!  Also,
// changing this would break outstanding assignments, so change with caution.
// A fix
// would be to store these strings somewhere when pushing the assignment out, so that
// the same ones are used when collecting and parsing.    But that will take a few hours
// more work, and it is only necessary if we decide to change these. Whoever decides
// to change these has to do that work.
export const PEER_GRADING_GUIDELINES_GRADE_MARKER =
  "OVERALL GRADE (a single number):";
export const PEER_GRADING_GUIDELINES_COMMENT_MARKER =
  "COMMENTS ABOUT GRADE (student will see, but not who made them):";

export const PEER_GRADING_DEFAULT_GUIDELINES = `
Put your final overall score below after "${PEER_GRADING_GUIDELINES_GRADE_MARKER}"


INSTRUCTOR: REPLACE THIS WITH INSTRUCTIONS FOR STUDENTS


${PEER_GRADING_GUIDELINES_GRADE_MARKER}



${PEER_GRADING_GUIDELINES_COMMENT_MARKER}

`;
