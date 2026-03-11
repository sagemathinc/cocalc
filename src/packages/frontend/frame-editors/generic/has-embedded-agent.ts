/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// File extensions where the coding agent is NOT useful — non-text
// editors that don't support set_value or are not code-like.
// Keep in sync with NO_AGENT_EXTENSIONS in chat.tsx.
const NO_AGENT_EXTENSIONS = new Set([
  "board",
  "slides",
  "pdf",
  "x11",
  "term",
  "course",
  "time-travel",
]);

/** Returns true when the given file path supports an embedded AI agent. */
export function hasEmbeddedAgent(path: string): boolean {
  if (path.endsWith(".ipynb")) return true;
  const ext = path.split(".").pop() ?? "";
  return !NO_AGENT_EXTENSIONS.has(ext);
}
