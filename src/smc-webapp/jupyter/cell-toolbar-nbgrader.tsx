/*
NBGrader toolbar for configuring the cells.
*/

import {
  /* Button, */ FormControl /* FormGroup, InputGroup */
} from "react-bootstrap";
import { React, Component } from "../app-framework"; // TODO: this will move
// const { Icon } = require("../r_misc");
// const { COLORS } = require("smc-util/theme");
// const misc = require("smc-util/misc");
import { Map as ImmutableMap } from "immutable";

const { CELL_TYPES } = require("./nbgrader");

interface NBGraderProps {
  actions: any;
  cell: ImmutableMap<string, any>; // TODO: what is this
}

interface NBGraderState {
  cell_type: any;
  cell_id: string;
}

export class NBGrader extends Component<NBGraderProps, NBGraderState> {
  constructor(props: NBGraderProps, context: any) {
    super(props, context);
    this.state = {
      cell_id: this.props.cell.get("id"),
      cell_type: this.get_cell_type()
    };
  }

  private get_cell_type() {
    const id = this.props.cell.get("id");
    return this.props.actions.store.get_nbgrader_cell_type(id) || "";
  }

  componentWillReceiveProps(next) {
    const next_cell_id = next.cell.get("id");
    if (next_cell_id !== this.state.cell_id) {
      this.setState({ cell_id: next_cell_id });
    }
    if (this.props.cell.get("metadata") !== next.cell.get("metadata")) {
      this.setState({ cell_type: this.get_cell_type() });
    }
  }

  select_type(val) {
    this.props.actions.nbgrader_set_cell_type(this.state.cell_id, val);
  }

  cell_type_options() {
    return CELL_TYPES.entrySeq().map(([k, v]) => (
      <option key={k} value={k}>
        {v}
      </option>
    ));
  }

  cell_type() {
    return (
      <div style={{ display: "flex" }}>
        Type:{" "}
        <FormControl
          componentClass="select"
          placeholder="select"
          onChange={e => this.select_type((e.target as any).value)}
          value={this.state.cell_type}
        >
          {this.cell_type_options()}
        </FormControl>
      </div>
    );
  }

  cell_info() {
    const grade_id =
      this.props.cell.getIn(["metadata", "nbgrader", "grade_id"]) || "N/A";
    return <div>ID: {grade_id}</div>;
  }

  points() {
    const num =
      this.props.cell.getIn(["metadata", "nbgrader", "points"]) || null;
    if (num === null) {
      return null;
    }
    return <div>Points: {num}</div>;
  }

  render() {
    const style = { display: "flex" };

    return (
      <div style={style}>
        <div>NBGrader</div>
        {this.points()}
        {this.cell_info()}
        {this.cell_type()}
      </div>
    );
  }
}
