/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { useIntl } from "react-intl";

import {
  CSS,
  React,
  useActions,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components";
import { labels } from "@cocalc/frontend/i18n";
import track from "@cocalc/frontend/user-tracking";
import { COLORS } from "@cocalc/util/theme";
import {
  FONT_SIZE_ICONS_NORMAL,
  PageStyle,
  TOP_BAR_ELEMENT_CLASS,
} from "./top-nav-consts";
import { blur_active_element } from "./util";

interface Props {
  height: number; // px
  pageStyle: PageStyle;
  on_click?: () => void;
}

const BASE_STYLE: CSS = {
  fontSize: FONT_SIZE_ICONS_NORMAL,
  display: "inline",
  color: COLORS.GRAY_M,
} as const;

export const ConnectionIndicator: React.FC<Props> = React.memo(
  (props: Props) => {
    const { on_click, height, pageStyle } = props;
    const { topPaddingIcons, sidePaddingIcons, fontSizeIcons } = pageStyle;

    const intl = useIntl();
    const actions = useActions("page");
    const connection_status = useTypedRedux("page", "connection_status");

    const connecting_style: CSS = {
      flex: "1",
      color: "white",
      overflow: "hidden",
      margin: "auto 0",
    } as const;

    const outer_style: CSS = {
      flex: "0 0 auto",
      display: "flex",
      alignItems: "center",
      color: COLORS.GRAY_M,
      cursor: "pointer",
      height: `${height}px`,
      padding: `${topPaddingIcons} ${sidePaddingIcons}`,
      ...(connection_status !== "connected"
        ? {
            backgroundColor:
              connection_status === "disconnected"
                ? COLORS.ANTD_RED_WARN
                : COLORS.ORANGE_WARN,
          }
        : {}),
    } as const;

    function getConnectionLabel() {
      switch (connection_status) {
        case "connected":
          return intl.formatMessage(labels.connected);
        case "connecting":
          return intl.formatMessage(labels.connecting);
        case "disconnected":
          return intl.formatMessage(labels.disconnected);
        default:
          return "Connection status unknown";
      }
    }

    function render_connection_status() {
      if (connection_status === "connected") {
        return (
          <Icon
            name="wifi"
            style={{ ...BASE_STYLE, fontSize: fontSizeIcons }}
          />
        );
      } else if (connection_status === "connecting") {
        return (
          <div style={connecting_style}>
            {intl.formatMessage(labels.connecting)}...
          </div>
        );
      } else if (connection_status === "disconnected") {
        return (
          <div style={connecting_style}>
            {intl.formatMessage(labels.disconnected)}
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
      track("top_nav", { name: "connection" });
    }

    return (
      <div
        className={TOP_BAR_ELEMENT_CLASS}
        role="status"
        aria-label={getConnectionLabel()}
        aria-live="polite"
        aria-busy={connection_status === "connecting"}
        style={outer_style}
        onClick={connection_click}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            connection_click();
          }
        }}
        tabIndex={0}
      >
        {render_connection_status()}
      </div>
    );
  },
);
