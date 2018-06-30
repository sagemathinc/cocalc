/*
Introspection display panel
*/

import { React, Component } from "../app-framework"; // TODO: this will move
import { Map as ImmutableMap } from "immutable";

const { Icon } = require("../r_misc"); // TODO: import types
const { merge } = require("smc-util/misc"); // TODO: import types
const { CellOutputMessage } = require("./cell-output-message"); // TODO: import types

const STYLE: React.CSSProperties = {
  padding: "10px 20px 5px",
  overflowY: "auto",
  border: "1px solid #888",
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
  right: "18px",
  fontSize: "14pt",
  color: "#666",
  marginTop: "-5px"
};

export interface IntrospectProps {
  actions: any; // TODO: type
  introspect: ImmutableMap<any, any>; // TODO: type
  font_size?: number;
}

export class Introspect extends Component<IntrospectProps> {
  close = () => this.props.actions.clear_introspect();
  render_content() {
    const found = this.props.introspect.get("found");
    if (found == null) {
      return <div>Nothing found</div>;
    }
    return <CellOutputMessage message={this.props.introspect} />;
  }
  render() {
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
