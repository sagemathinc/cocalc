/*
The toolbar at the top of each cell
*/
import { Map as ImmutableMap } from "immutable";

import { React, Component } from "../app-framework"; // TODO: this will move
const { COLORS } = require("smc-util/theme");
const { NBGrader } = require("./cell-toolbar-nbgrader");
import { React, Component, Rendered } from "../app-framework";

import { Slideshow } from "./cell-toolbar-slideshow";
import { Attachments } from "./cell-toolbar-attachments";
import { TagsToolbar } from "./cell-toolbar-tags";
import { Metadata } from "./cell-toolbar-metadata";
import { Map } from "immutable";
import { JupyterActions } from "./browser-actions";

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
  actions: JupyterActions;
  cell_toolbar: string;
  cell: Map<string, any>; // TODO: what is this
}

export type CellToolbarProps = IToolbar & { cell_toolbar: string };

const TOOLBARS = {
  slideshow: Slideshow,
  attachments: Attachments,
  tags: TagsToolbar,
  metadata: Metadata,
  nbgrader: NBGrader
};

export class CellToolbar extends Component<CellToolbarProps> {
  public render(): Rendered {
    const T = TOOLBARS[this.props.cell_toolbar];
    const props: IToolbar = {
      actions: this.props.actions,
      cell: this.props.cell
    };

    if (this.props.cell_toolbar === "nbgrader") {
      const id = this.props.cell.get("id");
      const cell_type = this.props.actions.store.get_nbgrader_cell_type(id);
      if ((cell_type || "") !== "") {
        style.background = COLORS.BS_BLUE_BGRND;
        style.color = "white";
      }
      props.student_mode = this.props.student_mode;
      props.name = this.props.actions.name;
    }
    if (T === undefined) {
      return <span> Toolbar not implemented: {this.props.cell_toolbar} </span>;
    }
    return (
      <div style={style}>
        <div style={{ flex: 1 }} />
        <div>
          <T {...props} />
        </div>
      </div>
    );
  }
}
