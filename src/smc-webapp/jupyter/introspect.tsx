/*
Introspection display panel
*/

import { React, Component, Rendered } from "../app-framework"; // TODO: this will move
import { Map as ImmutableMap } from "immutable";

const { Icon } = require("../r_misc"); // TODO: import types
const { merge } = require("smc-util/misc"); // TODO: import types

import { CellOutputMessage } from "./output-messages/message";
import { JupyterActions } from "./browser-actions";

const STYLE: React.CSSProperties = {
  padding: "10px 25px 5px",
  overflowY: "auto",
  borderTop: "2px solid #ccc",
  height: "100vh"
};

const INNER_STYLE: React.CSSProperties = {
  border: "1px solid rgb(207, 207, 207)",
  borderRadius: "2px",
  background: "rgb(247, 247, 247)",
  padding: "5px 25px"
};

const CLOSE_STYLE: React.CSSProperties = {
  cursor: "pointer",
  position: "absolute",
  right: "5px",
  fontSize: "14pt",
  color: "#666",
  marginTop: "-5px"
};

export interface IntrospectProps {
  actions: JupyterActions;
  introspect: ImmutableMap<string, any>;
  font_size?: number;
}

export class Introspect extends Component<IntrospectProps> {
  close = (): void => {
    this.props.actions.clear_introspect();
  };

  render_content(): Rendered {
    const found = this.props.introspect.get("found");
    if (found != null && !found) {
      // TODO: is "found" a boolean? if so this should be `found === false`
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
        <Icon name="times" onClick={this.close} style={CLOSE_STYLE} />
        <div style={inner_style}>{this.render_content()}</div>
      </div>
    );
  }
}
