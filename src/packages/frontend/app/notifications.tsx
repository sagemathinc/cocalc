/*
 *  This file is part of CoCalc: Copyright © 2020-2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { blue as ANTD_BLUE } from "@ant-design/colors";
import { Badge } from "antd";
import { useEffect, useMemo } from "react";

import { set_window_title } from "@cocalc/frontend/browser";
import {
  CSS,
  React,
  redux,
  useActions,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components";
import track from "@cocalc/frontend/user-tracking";
import { unreachable } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { PageStyle, TOP_BAR_ELEMENT_CLASS } from "./top-nav-consts";
import { blur_active_element } from "./util";

interface Props {
  type: "bell" | "notifications";
  active: boolean;
  pageStyle: PageStyle;
}

function NotificationShell({
  active,
  pageStyle,
  onClick,
  children,
  type,
}: {
  active: boolean;
  pageStyle: PageStyle;
  onClick: (e: React.MouseEvent) => void;
  children: React.JSX.Element;
  type: Props["type"];
}) {
  const { topPaddingIcons, sidePaddingIcons } = pageStyle;
  const outer_style: CSS = {
    padding: `${topPaddingIcons} ${sidePaddingIcons}`,
    height: `${pageStyle.height}px`,
    ...(active ? { backgroundColor: COLORS.TOP_BAR.ACTIVE } : {}),
  };

  const inner_style: CSS = {
    cursor: "pointer",
    position: "relative",
    ...(type === "notifications"
      ? { top: Math.floor(pageStyle.height / 10) + 1 }
      : { top: 1 }),
  };

  const className = TOP_BAR_ELEMENT_CLASS + (active ? " active" : "");

  return (
    <div style={outer_style} onClick={onClick} className={className}>
      <div style={inner_style}>{children}</div>
    </div>
  );
}

const BellNotification = React.memo(function BellNotification({
  active,
  pageStyle,
}: Omit<Props, "type">) {
  const page_actions = useActions("page");
  const count = useTypedRedux("file_use", "notify_count") ?? 0;

  function onClick(e) {
    e.preventDefault();
    e.stopPropagation();
    page_actions.toggle_show_file_use();
    blur_active_element();
    if (!active) {
      track("top_nav", { name: "file_use" });
    }
  }

  return (
    <NotificationShell
      active={active}
      pageStyle={pageStyle}
      onClick={onClick}
      type="bell"
    >
      <Badge
        showZero
        color={count == 0 ? COLORS.GRAY : undefined}
        count={count}
        className={count > 0 ? "smc-bell-notification" : ""}
      />
    </NotificationShell>
  );
});

const MentionsNotification = React.memo(function MentionsNotification({
  active,
  pageStyle,
}: Omit<Props, "type">) {
  const { fontSizeIcons } = pageStyle;
  const newsBadgeOffset = `-${fontSizeIcons}`;
  const page_actions = useActions("page");
  const mentions_store = redux.getStore("mentions");
  const mentions = useTypedRedux("mentions", "mentions");
  const news_unread = useTypedRedux("news", "unread");
  const unread_message_count =
    useTypedRedux("account", "unread_message_count") ?? 0;

  const count = useMemo(() => {
    return mentions_store.getUnreadSize() ?? 0;
  }, [mentions, mentions_store]);

  useEffect(() => {
    set_window_title();
  }, [count, news_unread, unread_message_count]);

  function onClick(e) {
    e.preventDefault();
    e.stopPropagation();
    page_actions.set_active_tab("notifications");
    if (!active) {
      track("top_nav", { name: "mentions" });
    }
  }

  const wiggle = news_unread > 0 || unread_message_count > 0;

  return (
    <NotificationShell
      active={active}
      pageStyle={pageStyle}
      onClick={onClick}
      type="notifications"
    >
      <Badge
        color={unread_message_count == 0 ? COLORS.GRAY : "green"}
        count={unread_message_count}
        size="small"
        showZero={false}
        offset={[0, `${fontSizeIcons}`]}
      >
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
            <Icon
              style={{ fontSize: fontSizeIcons }}
              className={wiggle ? "smc-bell-notification" : ""}
              name="mail"
            />
          </Badge>
        </Badge>
      </Badge>
    </NotificationShell>
  );
});

export const Notification: React.FC<Props> = React.memo((props: Props) => {
  const { type, ...rest } = props;
  switch (type) {
    case "bell":
      return <BellNotification {...rest} />;
    case "notifications":
      return <MentionsNotification {...rest} />;
    default:
      unreachable(type);
      return null;
  }
});
