/*
Websocket connection status indicator for a single project.
*/

import { React, Rendered, Component } from "../../app-framework";

import { WebsocketState } from "./websocket-state";

const { Icon } = require("smc-webapp/r_misc");

interface Props {
  state?: WebsocketState;
}

export class WebsocketIndicator extends Component<Props, {}> {
  render(): Rendered {
    return (
      <span title={this.props.state}>
        <Icon
          style={{
            color: color(this.props.state)
          }}
          name={"wifi"}
        />
      </span>
    );
  }
}

function color(state: WebsocketState | undefined): string {
  switch (state) {
    case "destroyed":
      return "rgb(255, 0, 0)";
    case "online":
      return "#666";
    case "offline": // trying to connect.
      return "rgb(255, 165, 0)";
    default:  // don't know yet, so same as offline.
      return "rgb(255, 165, 0)";
  }
}
