/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React, useActions, useTypedRedux } from "../app-framework";
import { COLORS } from "@cocalc/util/theme";
import { user_tracking } from "../user-tracking";
import { NavItem } from "react-bootstrap";
import { blur_active_element } from "./util";
import { Badge } from "antd";

interface Props {
  active: boolean;
  on_click?: () => void;
}

const OUTER_STYLE: React.CSSProperties = {
  position: "relative",
  float: "left",
};

const ACTIVE_OUTER_STYLE: React.CSSProperties = {
  ...OUTER_STYLE,
  ...{ backgroundColor: COLORS.TOP_BAR.ACTIVE },
};

export const NotificationBell: React.FC<Props> = React.memo(
  ({ active, on_click }) => {
    const page_actions = useActions("page");
    const count = useTypedRedux("file_use", "notify_count");

    function handle_navitem_click() {
      page_actions.toggle_show_file_use();
      blur_active_element();
      on_click?.();
      if (!active) {
        user_tracking("top_nav", { name: "file_use" });
      }
    }

    return (
      <NavItem
        style={active ? ACTIVE_OUTER_STYLE : OUTER_STYLE}
        onClick={handle_navitem_click}
        className={active ? "active" : undefined}
      >
        <div
          style={{
            padding: "6px",
            fontSize: "18pt",
            cursor: "pointer",
          }}
        >
          <Badge
            showZero
            color={count == 0 ? "#999" : undefined}
            count={count}
            className={count > 0 ? "smc-bell-notification" : ""}
          />
        </div>
      </NavItem>
    );
  }
);
