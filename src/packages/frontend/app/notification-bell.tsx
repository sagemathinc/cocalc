/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Badge } from "antd";

import {
  CSS,
  React,
  useActions,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { COLORS } from "@cocalc/util/theme";
import { user_tracking } from "../user-tracking";
import { blur_active_element } from "./util";
import { TOP_BAR_ELEMENT_CLASS } from "./top-nav-consts";

interface Props {
  type: "bell" | "mentions";
  active: boolean;
}

const OUTER_STYLE: CSS = {
  paddingLeft: "5px",
  paddingRight: "5px",
  position: "relative",
  float: "left",
} as const;

const ACTIVE_OUTER_STYLE: CSS = {
  ...OUTER_STYLE,
  ...{ backgroundColor: COLORS.TOP_BAR.ACTIVE },
} as const;

const INNER_STYLE: CSS = {
  padding: "6px",
  fontSize: "18pt",
  cursor: "pointer",
};

export const Notification: React.FC<Props> = React.memo((props: Props) => {
  const { active } = props;
  const page_actions = useActions("page");
  const count = useTypedRedux("file_use", "notify_count");

  function handle_navitem_click(e) {
    e.preventDefault();
    e.stopPropagation();
    page_actions.toggle_show_file_use();
    blur_active_element();
    if (!active) {
      user_tracking("top_nav", { name: "file_use" });
    }
  }

  const className = `${TOP_BAR_ELEMENT_CLASS} ${active ? "active" : ""}}`;

  return (
    <div
      style={active ? ACTIVE_OUTER_STYLE : OUTER_STYLE}
      onClick={handle_navitem_click}
      className={className}
    >
      <div style={INNER_STYLE}>
        <Badge
          showZero
          color={count == 0 ? "#999" : undefined}
          count={count}
          className={count > 0 ? "smc-bell-notification" : ""}
        />
      </div>
    </div>
  );
});
