/*
X11 Window frame.
*/

const { Icon } = require("smc-webapp/r_misc");

import { Map } from "immutable";

import { React, Component, Rendered } from "../../app-framework";

import { Actions } from "./actions";

interface Props {
  id: string;
  info: Map<string, any>;
  actions: Actions;
  is_current: boolean;
}

export class WindowTab extends Component<Props, {}> {
  static displayName = "X11-WindowTab";

  shouldComponentUpdate(next): boolean {
    return (
      !this.props.info.equals(next.info) ||
      this.props.is_current != next.is_current
    );
  }

  render_icon(): Rendered {
    if (this.props.info.get("icon")) {
      return <img width={"20px"} src={this.props.info.get("icon")} />;
    }
  }

  render_close_button(): Rendered {
    const color = this.props.is_current ? "#fff" : "#458ac9";
    const backgroundColor = this.props.is_current ? "#458ac9" : "#fff";
    return (
      <div
        style={{
          float: "right",
          backgroundColor,
          color,
          position: "relative",
          padding: "0 5px"
        }}
        onClick={() => {
          this.props.actions.close_window(
            this.props.id,
            this.props.info.get("wid")
          );
        }}
      >
        <Icon name="times" />
      </div>
    );
  }

  render(): Rendered {
    return (
      <div
        onClick={() => {
          this.props.actions.set_window(
            this.props.id,
            this.props.info.get("wid")
          );
        }}
        style={{
          display: "inline-block",
          width: "150px",
          overflow: "hidden",
          whiteSpace: "nowrap",
          cursor: "pointer",
          padding: "0 0 0 5px",
          borderRight: "1px solid grey",
          background: this.props.is_current ? "#458ac9" : "#fff",
          color: this.props.is_current ? "#fff" : "#458ac9"
        }}
      >
        {this.render_close_button()}
        {this.render_icon()}
        {this.props.info.get("title")}
      </div>
    );
  }
}
