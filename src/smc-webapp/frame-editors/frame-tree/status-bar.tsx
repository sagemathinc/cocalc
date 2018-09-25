/*
Show a minimal status bar at the bottom of the screen when status is set in the store.

Very simple for now.  We should obviously add more later, e.g., number of lines of the file...
*/

import { React, Component, Rendered } from "../../app-framework";
const { Loading, Space } = require("smc-webapp/r_misc");

interface Props {
  status: string;
}

export class StatusBar extends Component<Props, {}> {
  shouldComponentUpdate(next: Props): boolean {
    return this.props.status !== next.status;
  }

  render_icon(): Rendered {
    if (this.props.status) {
      return <Loading text="" />;
    }
  }

  render(): Rendered {
    return (
      <div
        style={{
          position: "fixed",
          bottom: "0px",
          minWidth: '30%',
          zIndex: 100,
          border: "0.5px solid lightgray",
          color: "#666",
          padding: "0 5px",
          fontSize: "9pt",
          background: "#fff"
        }}
      >
        {this.render_icon()}
        {this.props.status}
        <Space />
      </div>
    );
  }
}
