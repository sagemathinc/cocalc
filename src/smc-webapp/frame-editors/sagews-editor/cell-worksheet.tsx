import { Map } from "immutable";
import { React, Component, Rendered, rtypes, rclass } from "../generic/react";

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

  render_cells(): Rendered {
    return <code>{JSON.stringify(this.props.cells.toJS())}</code>;
  }

  render(): Rendered {
    return <div>Cell Worksheet {this.render_cells()}</div>;
  }
}

const tmp0 = rclass(CellWorksheet);
export { tmp0 as CellWorksheet };
