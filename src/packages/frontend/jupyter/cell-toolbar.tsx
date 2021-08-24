/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
The toolbar at the top of each cell
*/

import { Map } from "immutable";
import { React, CSS } from "../app-framework";

import { Slideshow } from "./cell-toolbar-slideshow";
import { Attachments } from "./cell-toolbar-attachments";
import { TagsToolbar } from "./cell-toolbar-tags";
import { Metadata } from "./cell-toolbar-metadata";
import { CreateAssignmentToolbar } from "./nbgrader/cell-toolbar-create-assignment";

import { JupyterActions } from "./browser-actions";

import { PROMPT_MIN_WIDTH } from "./prompt/base";

const STYLE: CSS = {
  marginLeft: PROMPT_MIN_WIDTH,
  display: "flex",
  background: "#eee",
  border: "1px solid rgb(247, 247, 247)",
} as const;

export interface CellToolbarProps {
  actions: JupyterActions;
  cell_toolbar: string;
  cell: Map<string, any>;
}

const TOOLBARS = {
  slideshow: Slideshow,
  attachments: Attachments,
  tags: TagsToolbar,
  metadata: Metadata,
  create_assignment: CreateAssignmentToolbar,
};

export const CellToolbar: React.FC<CellToolbarProps> = React.memo(
  (props: CellToolbarProps) => {
    const { actions, cell_toolbar, cell } = props;

    const T = TOOLBARS[cell_toolbar];
    if (T === undefined) {
      return <span> Toolbar not implemented: {cell_toolbar} </span>;
    }
    return (
      <div style={STYLE}>
        <T actions={actions} cell={cell} />
      </div>
    );
  }
);
