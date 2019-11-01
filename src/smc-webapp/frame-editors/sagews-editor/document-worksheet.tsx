import { Map } from "immutable";
import {
  React,
  Component,
  Rendered,
  rtypes,
  rclass
} from "../../app-framework";

import { input_is_hidden, output_is_hidden } from "./flags";

interface Props {
  // reduxProps:
  cells: Map<string, Map<string, any>>;
}

function cells_to_value(cells: Map<string, Map<string, any>>): string {
  let value: string = ""; // todo: sort matters...
  cells.forEach((cell, _) => {
    if (input_is_hidden(cell.get("flags"))) {
      value += "hidden";
    } else {
      value += cell.get("input");
    }
    value += "\n---\n";
    if (output_is_hidden(cell.get("flags"))) {
      value += "hidden";
    } else {
      value += JSON.stringify(cell.get("output", Map()).toJS());
    }
    value += "\n===\n";
    return;
  });
  return value;
}

class DocumentWorksheet extends Component<Props, {}> {
  static reduxProps({ name }) {
    return {
      [name]: {
        cells: rtypes.immutable.Map
      }
    };
  }

  render_doc(): Rendered {
    return (
      <textarea
        rows={10}
        value={cells_to_value(this.props.cells)}
        style={{ width: "100%" }}
        onChange={function() {}}
      />
    );
  }

  render(): Rendered {
    return <div>{this.render_doc()}</div>;
  }
}

const tmp0 = rclass(DocumentWorksheet);
export { tmp0 as DocumentWorksheet };
