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

import {
  file_associations,
  type FileSpec,
} from "@cocalc/frontend/file-associations";
import { filename_extension, path_split } from "@cocalc/util/misc";

function getFileAssociation(path: string): FileSpec | undefined {
  const ext = filename_extension(path).toLowerCase();
  if (ext) {
    return file_associations[ext];
  }
  return file_associations[`noext-${path_split(path).tail.toLowerCase()}`];
}

export function hasCodingAgent(path: string): boolean {
  const association = getFileAssociation(path);
  if (association == null) return false;
  if (association.editor === "codemirror" || association.editor === "latex") {
    return true;
  }
  // Some text/code editors (html, markdown, qmd, rmd, rst, etc.) are
  // registered elsewhere and don't set `editor` here, but they do have
  // a CodeMirror mode in file_associations.
  return (
    association.editor == null &&
    typeof association.opts?.mode === "string" &&
    association.opts.mode.length > 0
  );
}

export type AgentComponent = ComponentType<{
  chatSyncdb: any;
  fontSize?: number;
}>;

const LazyNotebookAgent = lazy(() =>
  import("@cocalc/frontend/frame-editors/jupyter-editor/notebook-agent").then(
    (m) => ({ default: m.NotebookAgent }),
  ),
) as unknown as AgentComponent;

const LazyCodingAgent = lazy(() =>
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
  if (filename_extension(path).toLowerCase() === "ipynb") {
    return { hasAgent: true, component: LazyNotebookAgent };
  }
  if (!hasCodingAgent(path)) {
    return { hasAgent: false };
  }
  return { hasAgent: true, component: LazyCodingAgent };
}

export function hasEmbeddedAgent(path: string): boolean {
  return getAgentSpec(path).hasAgent;
}
