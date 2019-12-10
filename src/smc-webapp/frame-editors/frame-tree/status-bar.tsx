/*
Show a minimal status bar at the bottom of the screen when status is set in the store.

Very simple for now.  We should obviously add more later, e.g., number of lines of the file...
*/

import { React, Component, Rendered } from "../../app-framework";
import { Space } from "smc-webapp/r_misc";

interface Props {
  status: string;
}

export class StatusBar extends Component<Props, {}> {
  shouldComponentUpdate(next: Props): boolean {
    return this.props.status !== next.status;
  }

  render(): Rendered {
    return (
      <div
        style={{
          opacity: 0.85,
          position: "fixed",
          bottom: "0px",
          minWidth: "30%",
          zIndex: 100,
          border: "0.5px solid lightgray",
          borderRadius: "3px",
          color: "#666",
          padding: "0 5px",
          fontSize: "9pt",
          background: "#fff"
        }}
      >
        {this.props.status}
        <Space />
      </div>
    );
  }
}
