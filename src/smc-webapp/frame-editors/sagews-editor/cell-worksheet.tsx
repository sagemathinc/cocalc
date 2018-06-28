import { Map } from "immutable";
import { React, Component, Rendered, rtypes, rclass } from "../../app-framework";

import { input_is_hidden, output_is_hidden } from "./flags";

import { InputCell } from "./input-cell";
import { OutputCell } from "./output-cell";
import { HiddenInputCell } from "./hidden-input-cell";
import { HiddenOutputCell } from "./hidden-output-cell";

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

  render_input_cell(cell: Map<string, any>): Rendered {
    if (input_is_hidden(cell.get("flags"))) {
      return <HiddenInputCell id={cell.get("id")} />;
    } else {
      return <InputCell input={cell.get("input")} id={cell.get("id")} />;
    }
  }

  render_output_cell(cell: Map<string, any>): Rendered {
    if (output_is_hidden(cell.get("flags"))) {
      return <HiddenOutputCell id={cell.get("id")} />;
    } else {
      return (
        <OutputCell output={cell.get("output", Map())} id={cell.get("id")} />
      );
    }
  }

  render_cells(): Rendered[] {
    const v: Rendered[] = [];
    // TODO: sort by position.
    this.props.cells.forEach((cell, id) => {
      v.push(
        <div key={id}>
          <div>{this.render_input_cell(cell)}</div>
          <div>{this.render_output_cell(cell)}</div>
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
