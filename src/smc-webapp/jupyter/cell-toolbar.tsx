/*
The toolbar at the top of each cell
*/

import { React, Component, Rendered } from "../app-framework";

import { Slideshow } from "./cell-toolbar-slideshow";
import { Attachments } from "./cell-toolbar-attachments";
import { TagsToolbar } from "./cell-toolbar-tags";
import { Metadata } from "./cell-toolbar-metadata";
import { Map } from "immutable";
import { JupyterActions } from "./actions";

const BAR_STYLE = {
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

const TOOLBARS = {
  slideshow: Slideshow,
  attachments: Attachments,
  tags: TagsToolbar,
  metadata: Metadata
};

export class CellToolbar extends Component<CellToolbarProps> {
  public render() : Rendered {
    const T = TOOLBARS[this.props.cell_toolbar];
    if (T === undefined) {
      return <span> Toolbar not implemented: {this.props.cell_toolbar} </span>;
    }
    return (
      <div style={BAR_STYLE}>
        <div style={{ flex: 1 }} />
        <div>
          <T actions={this.props.actions} cell={this.props.cell} />
        </div>
      </div>
    );
  }
}
