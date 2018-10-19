/*
X11 Window frame.
*/

const { Icon } = require("smc-webapp/r_misc");

import { Map } from "immutable";

import { React, Component, Rendered } from "../../app-framework";

import { Actions } from "./actions";

import { TAB_BAR_GREY, TAB_BAR_BLUE } from "./theme";

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
      return (
        <img
          height={"20px"}
          style={{ paddingRight: "5px" }}
          src={this.props.info.get("icon")}
        />
      );
    }
    return <Icon name="file" style={{ height: "20px", paddingRight: "5px" }} />;
  }

  render_close_button(): Rendered {
    const color = this.props.is_current ? TAB_BAR_GREY : TAB_BAR_BLUE;
    const backgroundColor = this.props.is_current
      ? TAB_BAR_BLUE
      : TAB_BAR_GREY;
    return (
      <div
        style={{
          float: "right",
          backgroundColor,
          color,
          position: "relative",
          padding: "0 5px"
        }}
        onClick={evt => {
          this.props.actions.close_window(
            this.props.id,
            this.props.info.get("wid")
          );
          evt.stopPropagation();
        }}
      >
        <Icon name="times" />
      </div>
    );
  }

  render(): Rendered {
    return (
      <div
        onClick={evt => {
          // FIRST set the active frame to the one we just clicked on!
          this.props.actions.set_active_id(this.props.id);
          // SECOND make this particular tab focused.
          this.props.actions.set_focused_window_in_frame(
            this.props.id,
            this.props.info.get("wid")
          );
          evt.stopPropagation();
        }}
        style={{
          display: "inline-block",
          width: "250px",
          overflow: "hidden",
          whiteSpace: "nowrap",
          cursor: "pointer",
          padding: "5px 0 0 5px",
          borderRight: "1px solid grey",
          background: this.props.is_current ? TAB_BAR_BLUE : TAB_BAR_GREY,
          color: this.props.is_current ? TAB_BAR_GREY : TAB_BAR_BLUE
        }}
      >
        {this.render_close_button()}
        {this.render_icon()}
        {this.props.info.get("title")}
      </div>
    );
  }
}

