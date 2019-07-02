/*
The toolbar at the top of each cell
*/

import { Map } from "immutable";
import { merge, copy } from "smc-util/misc2";
import { React, Component, Rendered } from "../app-framework";

import { Slideshow } from "./cell-toolbar-slideshow";
import { Attachments } from "./cell-toolbar-attachments";
import { TagsToolbar } from "./cell-toolbar-tags";
import { Metadata } from "./cell-toolbar-metadata";
import { CreateAssignmentToolbar } from "./nbgrader/cell-toolbar-create-assignment";

import { JupyterActions } from "./browser-actions";

const DEFAULT_STYLE = {
  width: "100%",
  display: "flex",
  background: "#eee",
  border: "1px solid rgb(247, 247, 247)",
  borderRadius: "2px",
  margin: "2px 0px",
  padding: "2px"
};

export interface CellToolbarProps {
  actions: JupyterActions;
  cell_toolbar: string;
  cell: Map<string, any>; // TODO: what is this
}

function style(x: object): object {
  return merge(copy(DEFAULT_STYLE), x);
}
const TOOLBARS = {
  slideshow: { component: Slideshow },
  attachments: {
    component: Attachments,
    style: style({ background: "#d9534f" })
  },
  tags: { component: TagsToolbar, style: style({ background: "#5bc0de" }) },
  metadata: { component: Metadata },
  create_assignment: {
    component: CreateAssignmentToolbar,
    style: style({ background: "#337ab7" })
  }
};

export class CellToolbar extends Component<CellToolbarProps> {
  public render(): Rendered {
    const T = TOOLBARS[this.props.cell_toolbar];
    if (T === undefined) {
      return <span> Toolbar not implemented: {this.props.cell_toolbar} </span>;
    }
    return (
      <div style={T.style != null ? T.style : DEFAULT_STYLE}>
        <div style={{ flex: 1 }} />
        <div>
          <T.component actions={this.props.actions} cell={this.props.cell} />
        </div>
      </div>
    );
  }
}
