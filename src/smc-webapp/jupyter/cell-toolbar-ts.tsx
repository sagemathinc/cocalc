/*
The toolbar at the top of each cell
*/

import { React, Component } from "../frame-editors/generic/react"; // TODO: this will move

const { Slideshow } = require("./cell-toolbar-slideshow"); // TODO: use import
const { Attachments } = require("./cell-toolbar-attachments"); // TODO: use import
const { TagsToolbar } = require("./cell-toolbar-tags"); // TODO: use import
const { Metadata } = require("./cell-toolbar-metadata"); // TODO: use import
import { Map as ImmutableMap } from "immutable";

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
  actions: any;
  cell_toolbar: string;
  cell: ImmutableMap<string,any>; // TODO: what is this
}

const TOOLBARS = {
  slideshow: Slideshow,
  attachments: Attachments,
  tags: TagsToolbar,
  metadata: Metadata
};

export class CellToolbar extends Component<CellToolbarProps> {
  render() {
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
