/*
Components related to toggling the way output is displayed.
*/

import { React, Component } from "../app-framework"; // TODO: this will move

const { Icon } = require("../r_misc"); // TODO: type
const { merge } = require("smc-util/misc");

const SCROLLED_STYLE: React.CSSProperties = {
  fontSize: "inherit",
  padding: 0,
  display: "flex", // flex used to move output prompt to bottom.
  flexDirection: "column"
};

const NORMAL_STYLE: React.CSSProperties = merge(
  { borderColor: "transparent" },
  SCROLLED_STYLE
);

interface OutputToggleProps {
  actions?: any; // TODO: types
  id: string;
  scrolled?: boolean;
}

export class OutputToggle extends Component<OutputToggleProps> {
  toggle_scrolled = () => {
    if (this.props.actions !== undefined) {
      this.props.actions.toggle_output(this.props.id, "scrolled");
    }
  };

  collapse_output = () => {
    if (this.props.actions !== undefined) {
      this.props.actions.toggle_output(this.props.id, "collapsed");
    }
  };
  render() {
    // We use a bootstrap button for the output toggle area, but disable the padding
    // and border. This looks pretty good and consistent and clean.
    return (
      <div
        className="btn btn-default"
        style={this.props.scrolled ? SCROLLED_STYLE : NORMAL_STYLE}
        onClick={this.toggle_scrolled}
        onDoubleClick={this.collapse_output}
      >
        <div style={{ flex: 1 }} /> {/* use up all space */}
        {this.props.children}
      </div>
    );
  }
}

interface CollapsedOutputProps {
  actions?: any;
  id: string;
}

export class CollapsedOutput extends Component<CollapsedOutputProps> {
  show_output = () => {
    if (this.props.actions !== undefined) {
      this.props.actions.toggle_output(this.props.id, "collapsed");
    }
  };
  render() {
    // We use a bootstrap button for the output toggle area, but disable the padding
    // and border. This looks pretty good and consistent and clean.
    return (
      <div
        className="btn btn-default"
        onClick={this.show_output}
        style={{
          textAlign: "center",
          width: "100%",
          color: "#777",
          padding: 0
        }}
      >
        <Icon name="ellipsis-h" />
      </div>
    );
  }
}
