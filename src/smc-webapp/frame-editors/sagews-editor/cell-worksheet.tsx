import { Map } from "immutable";
import { React, Component, Rendered, rtypes, rclass } from "../generic/react";

import { InputCell } from "./cell-input";
import { OutputCell } from "./cell-output";

interface Props {
  // reduxProps:
  cells: Map<string, Map<string, any>>;
}

class CellWorksheet extends Component<Props, {}> {
  static reduxProps({ name }) {
    return {
      [name]: {
        cells: rtypes.immutable.Map
      }
    };
  }

  render_cells(): Rendered[] {
    const v: Rendered[] = [];
    // TODO: sort by position.
    this.props.cells.forEach((cell, id) => {
      v.push(
        <div key={id}>
          <div>
            <InputCell input={cell.get("input")} />
          </div>
          <div>
            <OutputCell output={cell.get("output", Map())} />
          </div>
        </div>
      );
    });
    return v;
  }

  render(): Rendered {
    return <div>{this.render_cells()}</div>;
  }
}

const tmp0 = rclass(CellWorksheet);
export { tmp0 as CellWorksheet };
