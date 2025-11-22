/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import type * as immutable from "immutable";

import { LanguageModel } from "@cocalc/util/db-schema/llm-utils";

import type { KernelMetadata, KernelSpec } from "@cocalc/util/jupyter/types";
export type { KernelMetadata, KernelSpec };

export type NotebookMode = "edit" | "escape";

export type Scroll =
  | number
  | "cell visible"
  | "cell visible force"
  | "cell top"
  | "list up" // should probably have been called "page up" and "page down"...
  | "list down";

export type KernelInfo = immutable.Map<string, any>;

export type CellToolbarName =
  | "slideshow"
  | "attachments"
  | "tags"
  | "ids"
  | "metadata"
  | "create_assignment";

// TODO -- this is pretty complicated, but will be nice to nail down.
export type Cell = immutable.Map<string, any>;

export type Cells = immutable.Map<string, Cell>;

export interface Usage {
  mem: number; // MiB
  mem_limit: number;
  mem_alert: AlertLevel;
  mem_pct: number; // %
  cpu: number; // 1 core = 100%
  cpu_runtime: number; // seconds, wall-time (not cpu time)
  cpu_limit: number;
  cpu_alert: AlertLevel;
  cpu_pct: number; // 100% full container quota
  time_alert: AlertLevel;
}

export type AlertLevel = "low" | "mid" | "high" | "none";

export type BackendState =
  | "failed"
  | "off"
  | "spawning"
  | "starting"
  | "running"
  | "closed";

// When the backend_state is 'running', then the kernel_state is one of these:
export type KernelState = "idle" | "busy" | "running";

export interface LLMTools {
  model: LanguageModel;
  setModel: (llm: LanguageModel) => void;
  toolComponents: {
    LLMCellTool;
    LLMError;
  };
}
