import { Map } from "immutable";
import { React, Component, Rendered, rtypes, rclass } from "../generic/react";

interface Props {
  // reduxProps:
  cells: Map<string, Map<string, any>>;
}

class DocumentWorksheet extends Component<Props, {}> {
  static reduxProps({ name }) {
    return {
      [name]: {
        cells: rtypes.immutable.Map
      }
    };
  }

  render_cells(): Rendered {
    return (
      <textarea
        value={JSON.stringify(this.props.cells.toJS())}
        style={{ width: "100%" }}
      />
    );
  }

  render(): Rendered {
    return (
      <div>
        Document Worksheet<br />
        {this.render_cells()}
      </div>
    );
  }
}

const tmp0 = rclass(DocumentWorksheet);
export { tmp0 as DocumentWorksheet };
