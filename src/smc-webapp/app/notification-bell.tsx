/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React, useActions } from "../app-framework";
import { COLORS } from "smc-util/theme";
import { user_tracking } from "../user-tracking";
import { Icon } from "../r_misc";
import { NavItem } from "react-bootstrap";

interface Props {
  count: number;
  active: boolean;
  on_click?: () => void;
}

const COUNT_STYLE: React.CSSProperties = {
  fontSize: "10pt",
  color: COLORS.FG_RED,
  position: "absolute",
  left: "16px",
  top: "11px",
  fontWeight: 700,
  background: "transparent",
};

const TWO_DIGIT_COUNT_STYLE: React.CSSProperties = {
  ...COUNT_STYLE,
  ...{
    left: "15.8px",
    background: COLORS.GRAY_L,
    borderRadius: "50%",
    border: "2px solid lightgrey",
  },
};

const OUTER_STYLE: React.CSSProperties = {
  position: "relative",
  float: "left",
};

const ACTIVE_OUTER_STYLE: React.CSSProperties = {
  ...OUTER_STYLE,
  ...{ backgroundColor: COLORS.TOP_BAR.ACTIVE },
};

export const NotificationBell: React.FC<Props> = React.memo(
  ({ count, active, on_click }) => {
    const page_actions = useActions("page");

    function handle_navitem_click() {
      page_actions.toggle_show_file_use();
      if (document.activeElement != null) {
        // otherwise, it'll be highlighted even when closed again
        (document.activeElement as any).blur?.();
      }
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
            padding: "10px",
            fontSize: "17pt",
            cursor: "pointer",
          }}
        >
          <Icon
            name="bell-o"
            className={count > 0 ? "smc-bell-notification" : ""}
            style={count > 0 ? { color: COLORS.FG_RED } : undefined}
          />
          {count > 0 && (
            <span style={count > 9 ? TWO_DIGIT_COUNT_STYLE : COUNT_STYLE}>
              {count}
            </span>
          )}
        </div>
      </NavItem>
    );
  }
);
