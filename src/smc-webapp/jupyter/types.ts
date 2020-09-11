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
  | "list up"
  | "list down";

export type ViewMode = "normal" | "json" | "raw";

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
