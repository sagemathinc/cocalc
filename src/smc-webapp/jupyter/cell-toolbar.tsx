/*
The toolbar at the top of each cell
*/

import { Map } from "immutable";
import { React, Component, Rendered } from "../app-framework";

import { Slideshow } from "./cell-toolbar-slideshow";
import { Attachments } from "./cell-toolbar-attachments";
import { TagsToolbar } from "./cell-toolbar-tags";
import { Metadata } from "./cell-toolbar-metadata";
import { CreateAssignmentToolbar } from "./nbgrader/cell-toolbar-create-assignment";

import { JupyterActions } from "./browser-actions";

import { PROMPT_MIN_WIDTH } from "./prompt";

const STYLE = {
  marginLeft: PROMPT_MIN_WIDTH,
  display: "flex",
  background: "#eee",
  border: "1px solid rgb(247, 247, 247)",
};

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

export class CellToolbar extends Component<CellToolbarProps> {
  public render(): Rendered {
    const T = TOOLBARS[this.props.cell_toolbar];
    if (T === undefined) {
      return <span> Toolbar not implemented: {this.props.cell_toolbar} </span>;
    }
    return (
      <div style={STYLE}>
        <T actions={this.props.actions} cell={this.props.cell} />
      </div>
    );
  }
}
