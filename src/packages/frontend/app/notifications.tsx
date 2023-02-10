/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Badge } from "antd";

import {
  CSS,
  React,
  redux,
  useActions,
  useMemo,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components";
import { unreachable } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { user_tracking } from "../user-tracking";
import { PageStyle, TOP_BAR_ELEMENT_CLASS } from "./top-nav-consts";
import { blur_active_element } from "./util";

interface Props {
  type: "bell" | "mentions";
  active: boolean;
  pageStyle: PageStyle;
}

export const Notification: React.FC<Props> = React.memo((props: Props) => {
  const { active, type, pageStyle } = props;
  const { topPaddingIcons, sidePaddingIcons, fontSizeIcons } = pageStyle;
  const page_actions = useActions("page");

  const mentions_store = redux.getStore("mentions");
  const mentions = useTypedRedux("mentions", "mentions");
  const notify_count = useTypedRedux("file_use", "notify_count");

  const count = useMemo(() => {
    switch (type) {
      case "bell":
        return notify_count ?? 0;
      case "mentions":
        return mentions_store.get_unseen_size(mentions) ?? 0;
      default:
        unreachable(type);
        return 0;
    }
  }, [type, notify_count, mentions]);

  const outer_style: CSS = {
    padding: `${topPaddingIcons} ${sidePaddingIcons}`,
    display: "flex",
    alignItems: "center",
    height: "100%",
    ...(active ? { backgroundColor: COLORS.TOP_BAR.ACTIVE } : {}),
  };

  const inner_style: CSS = {
    cursor: "pointer",
    position: "relative",
    display: "flex",
    alignItems: "center",
    ...(type === "mentions" && count > 0
      ? {
          top: 3, // bit offset to make room for the badge
        }
      : {}),
  };

  function onClick(e) {
    e.preventDefault();
    e.stopPropagation();

    switch (type) {
      case "bell":
        page_actions.toggle_show_file_use();
        blur_active_element();
        if (!active) {
          user_tracking("top_nav", { name: "file_use" });
        }
        break;

      case "mentions":
        page_actions.set_active_tab("notifications");
        if (!active) {
          user_tracking("top_nav", { name: "mentions" });
        }
        break;

      default:
        unreachable(type);
    }
  }

  function renderBadge() {
    switch (type) {
      case "bell":
        return (
          <Badge
            showZero
            color={count == 0 ? COLORS.GRAY : undefined}
            count={count}
            className={count > 0 ? "smc-bell-notification" : ""}
          />
        );

      case "mentions":
        return (
          <Badge
            color={count == 0 ? COLORS.GRAY : undefined}
            count={count}
            size="small"
          >
            <Icon style={{ fontSize: fontSizeIcons }} name="mail" />
          </Badge>
        );

      default:
        unreachable(type);
    }
  }

  const className = TOP_BAR_ELEMENT_CLASS + (active ? " active" : "");

  return (
    <div style={outer_style} onClick={onClick} className={className}>
      <div style={inner_style}>{renderBadge()}</div>
    </div>
  );
});
