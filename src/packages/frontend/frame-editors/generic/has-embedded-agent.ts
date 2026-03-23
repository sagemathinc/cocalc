/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// File extensions where the coding agent is NOT useful — non-text
// editors that don't support set_value or are not code-like.
// Keep in sync with NO_AGENT_EXTENSIONS in chat.tsx.
const NO_AGENT_EXTENSIONS = new Set([
  "app",
  "board",
  "slides",
  "pdf",
  "x11",
  "term",
  "course",
  "time-travel",
  // Media files — legacy MediaViewer, no frame-tree side chat
  "png",
  "jpg",
  "jpeg",
  "gif",
  "bmp",
  "ico",
  "webp",
  "svg",
  "tiff",
  "tif",
  "mp4",
  "webm",
  "avi",
  "mov",
  "mp3",
  "wav",
  "ogg",
  "flac",
]);

/** Returns true when the given file path supports an embedded AI agent. */
export function hasEmbeddedAgent(path: string): boolean {
  if (path.endsWith(".ipynb")) return true;
  const ext = path.split(".").pop() ?? "";
  return !NO_AGENT_EXTENSIONS.has(ext);
}
