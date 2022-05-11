/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as immutable from "immutable";

export type NotebookMode = "edit" | "escape";

export type CellType = "raw" | "markdown" | "code" | "multi";

export type Scroll =
  | number
  | "cell visible"
  | "cell top"
  | "list up"   // should probably have been called "page up" and "page down"...
  | "list down";

export type KernelInfo = immutable.Map<string, any>;

export type CellToolbarName =
  | "slideshow"
  | "attachments"
  | "tags"
  | "metadata"
  | "create_assignment";

// TODO -- this is pretty complicated, but will ne nice to nail down.
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
  | "init"
  | "ready"
  | "spawning"
  | "starting"
  | "running";
