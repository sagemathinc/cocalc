/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import {
  CSS,
  React,
  useActions,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components";
import { COLORS } from "@cocalc/util/theme";
import { user_tracking } from "../user-tracking";
import {
  FONT_SIZE_ICONS_NORMAL,
  NAV_HEIGHT_PX,
  PageStyle,
  TOP_BAR_ELEMENT_CLASS,
} from "./top-nav-consts";
import { blur_active_element } from "./util";

interface Props {
  height: number; // px
  narrow: boolean; // if true, there is need to have room for the fullscreen button
  pageStyle: PageStyle;
  on_click?: () => void;
}

const BASE_STYLE: CSS = {
  fontSize: FONT_SIZE_ICONS_NORMAL,
  display: "inline",
  color: "grey",
};

export const ConnectionIndicator: React.FC<Props> = React.memo(
  (props: Props) => {
    const { on_click, height, narrow, pageStyle } = props;
    const { topPaddingIcons, sidePaddingIcons, fontSizeIcons } = pageStyle;
    const connection_status = useTypedRedux("page", "connection_status");
    const mesg_info = useTypedRedux("account", "mesg_info");
    const actions = useActions("page");

    const CONNECTING_STYLE: CSS = {
      backgroundColor: "#FFA500",
      color: "white",
      padding: `${topPaddingIcons} ${sidePaddingIcons}`,
      overflow: "hidden",
      zIndex: 101, // tick more than fullscreen!
    };

    const style: CSS = {
      display: "flex",
      flex: "0 0 auto",
      color: COLORS.GRAY_M,
      lineHeight: "18px",
      cursor: "pointer",
      maxHeight: `${height}px`,
      marginRight: narrow ? "0px" : `${NAV_HEIGHT_PX + 5}px`,
    };

    function render_connection_status() {
      if (connection_status === "connected") {
        const icon_style: CSS = { ...BASE_STYLE, fontSize: fontSizeIcons };
        if (mesg_info?.get("enqueued") ?? 0 > 6) {
          // serious backlog of data!
          icon_style.color = "red";
        } else if (mesg_info?.get("count") ?? 0 > 2) {
          // worrisome amount
          icon_style.color = "#08e";
        } else if (mesg_info?.get("count") ?? 0 > 0) {
          // working well but doing something minimal
          icon_style.color = "#00c";
        }
        return (
          <div style={{ padding: "7px" }}>
            <Icon name="wifi" style={icon_style} />
          </div>
        );
      } else if (connection_status === "connecting") {
        return <div style={CONNECTING_STYLE}>connecting...</div>;
      } else if (connection_status === "disconnected") {
        return <div style={CONNECTING_STYLE}>disconnected</div>;
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

    return (
      <div
        className={TOP_BAR_ELEMENT_CLASS}
        style={style}
        onClick={connection_click}
      >
        {render_connection_status()}
      </div>
    );
  }
);
