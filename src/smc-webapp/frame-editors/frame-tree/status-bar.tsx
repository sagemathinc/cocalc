/*
Show a minimal status bar at the bottom of the screen when status is set in the store.

Very simple for now.  We should obviously add more later, e.g., number of lines of the file...
*/

import { React, Component, Rendered } from "../generic/react";
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
      return <Loading text='' />;
    }
  }

  render(): Rendered {
    return (
      <div
        style={{
          border: "1px solid lightgray",
          color: "#333",
          padding: "0 5px",
          fontSize: "10pt",
          background: "#eee"
        }}
      >
        {this.render_icon()}
        {this.props.status}
        <Space />
      </div>
    );
  }
}
