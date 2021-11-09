/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Show a minimal status bar at the bottom of the screen when status is set in the store.

Very simple for now.  We should obviously add more later, e.g., number of lines of the file...
*/

import { Component, Rendered } from "../../app-framework";
import { Icon, Space } from "@cocalc/frontend/components";

interface Props {
  status: string;
  onClear: () => {};
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
          right: "0px",
          minWidth: "30%",
          zIndex: 100,
          border: "0.5px solid lightgray",
          borderRadius: "3px",
          color: "#666",
          padding: "0 5px",
          fontSize: "9pt",
          background: "#fff",
          boxShadow: "-2px -2px 2px #ccc",
        }}
      >
        <Icon
          name="times"
          onClick={this.props.onClear}
          style={{ float: "right", marginTop:'2.5px' }}
        />
        {this.props.status}
        <Space />
      </div>
    );
  }
}
