/*
X11 Window frame.
*/

import { Map } from "immutable";

import { React, Component, Rendered } from "../../app-framework";

import { Actions } from "./actions";

interface Props {
  id: string;
  info: Map<string, any>;
  actions: Actions;
}

export class WindowTab extends Component<Props, {}> {
  static displayName = "X11-WindowTab";

  shouldComponentUpdate(next): boolean {
    return !this.props.info.equals(next.info);
  }

  render(): Rendered {
    return (
      <a
        style={{
          cursor: "pointer",
          padding: "0 5px",
          borderRight: "1px solid grey"
        }}
      >
        {this.props.info.get("title")}
      </a>
    );
  }
}
