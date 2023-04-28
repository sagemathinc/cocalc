/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { blue as ANTD_BLUE } from "@ant-design/colors";
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
import track from "@cocalc/frontend/user-tracking";
import { PageStyle, TOP_BAR_ELEMENT_CLASS } from "./top-nav-consts";
import { blur_active_element } from "./util";

interface Props {
  type: "bell" | "notifications";
  active: boolean;
  pageStyle: PageStyle;
}

export const Notification: React.FC<Props> = React.memo((props: Props) => {
  const { active, type, pageStyle } = props;
  const { topPaddingIcons, sidePaddingIcons, fontSizeIcons } = pageStyle;
  const newsBadgeOffset = `-${fontSizeIcons}`;
  const page_actions = useActions("page");

  const mentions_store = redux.getStore("mentions");
  const mentions = useTypedRedux("mentions", "mentions");
  const notify_count = useTypedRedux("file_use", "notify_count");
  const news_unread = useTypedRedux("news", "unread");

  const count = useMemo(() => {
    switch (type) {
      case "bell":
        return notify_count ?? 0;
      case "notifications":
        return mentions_store.get_unseen_size(mentions) ?? 0;
      default:
        unreachable(type);
        return 0;
    }
  }, [type, notify_count, mentions]);

  const outer_style: CSS = {
    padding: `${topPaddingIcons} ${sidePaddingIcons}`,
    height: `${pageStyle.height}px`,
    ...(active ? { backgroundColor: COLORS.TOP_BAR.ACTIVE } : {}),
  };

  const inner_style: CSS = {
    cursor: "pointer",
    position: "relative",
    ...(type === "notifications"
      ? { top: Math.floor(pageStyle.height / 10) + 1 } // bit offset to make room for the badge
      : { top: 1 }),
  };

  function onClick(e) {
    e.preventDefault();
    e.stopPropagation();

    switch (type) {
      case "bell":
        page_actions.toggle_show_file_use();
        blur_active_element();
        if (!active) {
          track("top_nav", { name: "file_use" });
        }
        break;

      case "notifications":
        page_actions.set_active_tab("notifications");

        if (count === 0 && news_unread > 0) {
          // guide user towards seeing the news, if there are no mentions
          redux.getActions("mentions").set_filter("allNews");
        }

        if (!active) {
          track("top_nav", { name: "mentions" });
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
            color={count == 0 ? COLORS.GRAY : COLORS.GRAY_M}
            count={count}
            className={count > 0 ? "smc-bell-notification" : ""}
          />
        );

      case "notifications":
        return (
          <Badge
            color={count == 0 ? COLORS.GRAY : undefined}
            count={count}
            size="small"
          >
            <Badge
              color={news_unread == 0 ? COLORS.GRAY : ANTD_BLUE.primary}
              count={news_unread}
              showZero={false}
              size="small"
              offset={[newsBadgeOffset, 0]}
            >
              <Icon style={{ fontSize: fontSizeIcons }} name="mail" />{" "}
            </Badge>
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
