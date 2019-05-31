/*
Insert a cell
*/

import { React, Component } from "../app-framework";

const { IS_TOUCH } = require("../feature"); // TODO: use import with types

import { JupyterActions } from "./browser-actions";
import { NotebookFrameActions } from "../frame-editors/jupyter-editor/cell-notebook/actions";

export interface InsertCellProps {
  actions: JupyterActions;
  frame_actions: NotebookFrameActions;
  id: string;
  position?: "above" | "below";
}

export interface InsertCellState {
  hover: boolean;
}

export class InsertCell extends Component<InsertCellProps, InsertCellState> {
  constructor(props: InsertCellProps, context: any) {
    super(props, context);
    this.state = { hover: false };
  }
  shouldComponentUpdate(
    nextProps: InsertCellProps,
    nextState: InsertCellState
  ) {
    return (
      nextProps.id !== this.props.id ||
      nextProps.position !== this.props.position ||
      nextState.hover !== this.state.hover
    );
  }
  click = (e: any) => {
    this.props.frame_actions.set_cur_id(this.props.id);
    const new_id = this.props.frame_actions.insert_cell(
      this.props.position === "below" ? 1 : -1
    );
    if (e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) {
      this.props.actions.set_cell_type(new_id, "markdown");
    }
    this.setState({ hover: false });
  };
  render() {
    const style: any = { height: "6px" }; // TODO: types
    if (IS_TOUCH) {
      // TODO: understand this comment
      // this whole approach makes no sense for a touch device, since no notion of hover, and is just confusing.
      return <div style={style} />;
    }
    if (this.state.hover) {
      style.backgroundColor = "#428bca";
    }
    return (
      <div
        style={style}
        onClick={this.click}
        onMouseEnter={() => this.setState({ hover: true })}
        onMouseLeave={() => this.setState({ hover: false })}
      />
    );
  }
}
