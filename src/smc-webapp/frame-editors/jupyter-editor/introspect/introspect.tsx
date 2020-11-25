/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Introspect -- display information related to help, source code,
etc., about a Jupyter notebook.  This is what appears as a pop-over
on the bottom half the of the screen for Jupyter classic.
*/

import { Map } from "immutable";
import { merge } from "smc-util/misc";
import {
  Component,
  React,
  Rendered,
  rtypes,
  rclass,
} from "../../../app-framework";
import { redux_name } from "../jupyter-actions";
import { JupyterEditorActions } from "../actions";
import { CellOutputMessage } from "../../../jupyter/output-messages/message";

interface Props {
  actions: JupyterEditorActions;
  id: string;
  font_size: number;

  // REDUX PROPS
  introspect?: Map<string, any>;
}

const STYLE: React.CSSProperties = {
  padding: "10px 25px 5px",
  overflowY: "auto",
};

const INNER_STYLE: React.CSSProperties = {
  border: "1px solid rgb(207, 207, 207)",
  borderRadius: "2px",
  background: "rgb(247, 247, 247)",
  padding: "5px 25px",
};

class Introspect extends Component<Props> {
  public shouldComponentUpdate(nextProps): boolean {
    return (
      this.props.introspect != nextProps.introspect ||
      this.props.font_size != nextProps.font_size
    );
  }

  public static reduxProps({ name }) {
    const name_of_jupyter_store = redux_name(name);
    return {
      [name_of_jupyter_store]: {
        introspect: rtypes.immutable.Map,
      },
    };
  }

  render_content(): Rendered {
    if (this.props.introspect == null) return;
    const found = this.props.introspect.get("found");
    if (found != null && !found) {
      return <div>Nothing found</div>;
    }
    return <CellOutputMessage message={this.props.introspect} />;
  }

  render(): Rendered {
    let inner_style: any;
    if (this.props.font_size != null) {
      inner_style = merge({ fontSize: this.props.font_size }, INNER_STYLE);
    } else {
      inner_style = INNER_STYLE;
    }
    return (
      <div style={STYLE}>
        <div style={inner_style}>{this.render_content()}</div>
      </div>
    );
  }
}

const tmp = rclass(Introspect);
export { tmp as Introspect };
