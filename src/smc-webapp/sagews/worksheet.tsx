/*
React component to render a Sage worksheet statically (for use by share server or public mode)
*/

import { React, Component, Rendered } from "../app-framework";

import { field_cmp } from "smc-util/misc";

import { Cell } from "./cell";

import { Cell as CellType } from "./parse-sagews";

interface Props {
  sagews: CellType[];
  style?: object;
}

export class Worksheet extends Component<Props> {
  private render_cell(cell: CellType): Rendered {
    return (
      <Cell
        key={cell.id}
        input={cell.input ? cell.input : ""}
        output={cell.output ? cell.output : {}}
        flags={cell.flags ? cell.flags : ""}
      />
    );
  }

  private render_cells(): Rendered[] {
    let cells: CellType[] = [];
    for (let cell of this.props.sagews) {
      if (cell.type === "cell") {
        cells.push(cell);
      }
    }
    cells.sort(field_cmp("pos"));
    const v: Rendered[] = [];
    for (let cell of cells) {
      v.push(this.render_cell(cell));
    }
    return v;
  }

  render() {
    return <div style={this.props.style}>{this.render_cells()}</div>;
  }
}
