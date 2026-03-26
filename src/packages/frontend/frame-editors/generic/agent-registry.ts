/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
 * Single source of truth for embedded agent eligibility and routing.
 *
 * Every call site that needs to know "does this file support an embedded
 * agent?" or "which agent component should I mount?" should go through
 * getAgentSpec(path).  The older hasEmbeddedAgent() convenience wrapper
 * is preserved for callers that only need the boolean.
 *
 * Agent components are loaded lazily via dynamic import() so they don't
 * bloat the initial bundle.
 */

import { lazy, type ComponentType } from "react";

// File extensions where the coding agent is NOT useful — non-text
// editors that don't support set_value or are not code-like.
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
  // Archive files — archive editor, no set_value / CodeMirror
  "zip",
  "tar",
  "tgz",
  "gz",
  "bz2",
  "bzip2",
  "xz",
  "lzip",
  "tbz2",
  "z",
  "lz",
  "lzma",
  "7z",
  "rar",
]);

export type AgentComponent = ComponentType<{
  chatSyncdb: any;
  fontSize?: number;
}>;

const LazyNotebookAgent = lazy(
  () =>
    import(
      "@cocalc/frontend/frame-editors/jupyter-editor/notebook-agent"
    ).then((m) => ({ default: m.NotebookAgent })),
) as unknown as AgentComponent;

const LazyCodingAgent = lazy(
  () =>
    import("@cocalc/frontend/frame-editors/llm/coding-agent").then((m) => ({
      default: m.CodingAgentEmbedded,
    })),
) as unknown as AgentComponent;

export interface AgentSpec {
  hasAgent: true;
  component: AgentComponent;
}

export interface NoAgentSpec {
  hasAgent: false;
}

export function getAgentSpec(path: string): AgentSpec | NoAgentSpec {
  if (path.endsWith(".ipynb")) {
    return { hasAgent: true, component: LazyNotebookAgent };
  }
  const ext = path.split(".").pop() ?? "";
  if (NO_AGENT_EXTENSIONS.has(ext)) {
    return { hasAgent: false };
  }
  return { hasAgent: true, component: LazyCodingAgent };
}

export function hasEmbeddedAgent(path: string): boolean {
  return getAgentSpec(path).hasAgent;
}
