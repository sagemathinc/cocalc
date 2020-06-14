import { React, useActions, useRedux } from "../app-framework";
import { blur_active_element } from "./util";
import { user_tracking } from "../user-tracking";
import { Icon } from "../r_misc";
import { NavItem } from "react-bootstrap";

interface Props {
  on_click?: () => void;
}

export const ConnectionIndicator: React.FC<Props> = React.memo(
  ({ on_click }) => {
    const connection_status = useRedux(["page", "connection_status"]);
    const mesg_info = useRedux(["account", "mesg_info"]);
    const actions = useActions("page");

    function render_connection_status() {
      if (connection_status === "connected") {
        const icon_style = {
          marginRight: "16px",
          fontSize: "13pt",
          display: "inline",
        };
        if (mesg_info?.get("enqueued") ?? 0 > 6) {
          // serious backlog of data!
          icon_style.color = "red";
        } else if (mesg_info?.get("count") ?? 0 > 2) {
          // worrisome amount
          icon_style.color = "#08e";
        } else if (mesg_info?.get("count") ?? 0 > 0) {
          // working well but doing something minimal
          icon_style.color = "#00c";
        } else {
          icon_style.color = "grey";
        }
        return (
          <div style={{ padding: "9px" }}>
            <Icon name="wifi" style={icon_style} />
          </div>
        );
      } else if (connection_status === "connecting") {
        return (
          <div
            style={{
              backgroundColor: "#FFA500",
              color: "white",
              padding: "1ex",
              overflow: "hidden",
            }}
          >
            connecting...
          </div>
        );
      } else if (connection_status === "disconnected") {
        return (
          <div
            style={{
              backgroundColor: "#FFA500",
              color: "white",
              padding: "1ex",
              overflow: "hidden",
            }}
          >
            disconnected
          </div>
        );
      }
    }

    function connection_click() {
      actions.show_connection(true);
      if (typeof on_click === "function") {
        on_click();
      }
      blur_active_element(); // otherwise, it'll be highlighted even when closed again
      user_tracking("top_nav", { name: "connection" });
    }

    const outer_styles = {
      color: "#666",
      fontSize: "10pt",
      lineHeight: "10pt",
      cursor: "pointer",
      float: "left",
    };
    const inner_styles = { paddingTop: "3px" };

    return (
      <NavItem style={outer_styles} onClick={connection_click}>
        <div style={inner_styles}>{render_connection_status()}</div>
      </NavItem>
    );
  }
);
