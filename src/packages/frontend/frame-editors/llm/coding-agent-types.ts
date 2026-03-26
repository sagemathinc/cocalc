/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Types and constants specific to the coding agent.
Shared agent types (DisplayMessage, styles, etc.) live in agent-base/.
*/

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface SearchReplace {
  search: string;
  replace: string;
}

export interface FileSearchReplace extends SearchReplace {
  path: string;
}

export interface EditBlock {
  startLine: number; // 1-based inclusive
  endLine: number; // 1-based inclusive
  replacement: string;
}

export interface ShowBlock {
  startLine: number; // 1-based inclusive
  endLine: number; // 1-based inclusive
}

export interface ExecBlock {
  id: number;
  command: string;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

export const TAG = "coding-agent";

/** Maximum number of document lines to include in the system prompt. */
export const MAX_VISIBLE_LINES = 100;

/** Max height for diff/code display blocks (px). ~8 lines of code. */
export const DIFF_MAX_HEIGHT = 150;
