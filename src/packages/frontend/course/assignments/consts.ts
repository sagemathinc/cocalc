/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
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
export const PEER_GRADING_GUIDE_FN = "GRADING-GUIDE.md";
