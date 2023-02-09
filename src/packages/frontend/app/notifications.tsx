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
import {
  FONT_SIZE_ICONS,
  SIDE_PADDING_ICONS,
  TOP_BAR_ELEMENT_CLASS,
  TOP_PADDING_ICONS,
} from "./top-nav-consts";
import { blur_active_element } from "./util";

interface Props {
  type: "bell" | "mentions";
  active: boolean;
}

const OUTER_STYLE: CSS = {
  padding: `${TOP_PADDING_ICONS} ${SIDE_PADDING_ICONS}`,
  position: "relative",
  display: "flex",
  alignItems: "center",
} as const;

const ACTIVE_OUTER_STYLE: CSS = {
  ...OUTER_STYLE,
  ...{ backgroundColor: COLORS.TOP_BAR.ACTIVE },
} as const;

const INNER_STYLE: CSS = {
  fontSize: "14px",
  cursor: "pointer",
};

export const Notification: React.FC<Props> = React.memo((props: Props) => {
  const { active, type } = props;
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
            <Icon
              style={{
                top: 3,
                position: "relative",
                fontSize: FONT_SIZE_ICONS,
              }}
              name="mail"
            />
          </Badge>
        );

      default:
        unreachable(type);
    }
  }

  const className = `${TOP_BAR_ELEMENT_CLASS} ${active ? "active" : ""}}`;

  return (
    <div
      style={active ? ACTIVE_OUTER_STYLE : OUTER_STYLE}
      onClick={onClick}
      className={className}
    >
      <div style={INNER_STYLE}>{renderBadge()}</div>
    </div>
  );
});
