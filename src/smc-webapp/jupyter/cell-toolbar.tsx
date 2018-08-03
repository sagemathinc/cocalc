/*
The toolbar at the top of each cell
*/

import { Map as ImmutableMap } from "immutable";

import { React, Component } from "../app-framework"; // TODO: this will move
const { COLORS } = require("smc-util/theme");
const { Slideshow } = require("./cell-toolbar-slideshow"); // TODO: use import
const { Attachments } = require("./cell-toolbar-attachments"); // TODO: use import
const { TagsToolbar } = require("./cell-toolbar-tags"); // TODO: use import
const { Metadata } = require("./cell-toolbar-metadata"); // TODO: use import
const { NBGrader } = require("./cell-toolbar-nbgrader");

function BAR_STYLE() {
  return {
    width: "100%",
    display: "flex",
    background: "#eee",
    border: "1px solid rgb(247, 247, 247)",
    borderRadius: "2px",
    margin: "2px 0px",
    padding: "2px"
  };
}

export interface CellToolbarProps {
  actions: any;
  cell_toolbar: string;
  cell: ImmutableMap<string, any>; // TODO: what is this
}

const TOOLBARS = {
  slideshow: Slideshow,
  attachments: Attachments,
  tags: TagsToolbar,
  metadata: Metadata,
  nbgrader: NBGrader
};

export class CellToolbar extends Component<CellToolbarProps> {
  render() {
    const style = (BAR_STYLE() as any);
    const T = TOOLBARS[this.props.cell_toolbar];
    if (this.props.cell_toolbar === "nbgrader") {
      const cell_type = this.props.actions.store.get_nbgrader_cell_type(
        this.props.cell.get("id")
      );
      if ((cell_type || "") !== "") {
        style.background = COLORS.BS_BLUE_BGRND;
        style.color = "white";
      }
    }
    if (T === undefined) {
      return <span> Toolbar not implemented: {this.props.cell_toolbar} </span>;
    }
    return (
      <div style={style}>
        <div style={{ flex: 1 }} />
        <div>
          <T actions={this.props.actions} cell={this.props.cell} />
        </div>
      </div>
    );
  }
}
