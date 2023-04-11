/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { blue as ANTD_BLUE } from "@ant-design/colors";
import { Badge, Menu } from "antd";
import { capitalize } from "lodash";
import React, { useMemo } from "react";

import { redux, useTypedRedux } from "@cocalc/frontend/app-framework";
import { Icon, Text } from "@cocalc/frontend/components";
import { COLORS } from "@cocalc/util/theme";
import { CHANNELS, CHANNELS_ICONS } from "@cocalc/util/types/news";
import { NotificationFilter } from "./mentions/types";
import { BOOKMARK_ICON_NAME } from "./mentions/util";

export const NewsCounter = () => {
  const news_unread = useTypedRedux("news", "unread");
  return (
    <Badge
      color={news_unread == 0 ? COLORS.GRAY : ANTD_BLUE.primary}
      count={news_unread}
      showZero={true}
    />
  );
};

const MentionsCounter = () => {
  const mentions = useTypedRedux("mentions", "mentions");
  const mentions_store = redux.getStore("mentions");
  const count = useMemo(() => {
    return mentions_store.get_unseen_size(mentions);
  }, [mentions]);

  return (
    <Badge
      color={count == 0 ? COLORS.GRAY : undefined}
      showZero={true}
      count={count}
    />
  );
};

const ITEMS = [
  {
    key: "mentions",
    label: (
      <Text strong style={{ fontSize: "125%" }}>
        @-Mentions <MentionsCounter />
      </Text>
    ),
    children: [
      {
        key: "unread",
        label: (
          <>
            <Icon name="eye-slash" /> Unread
          </>
        ),
      },
      {
        key: "read",
        label: (
          <>
            <Icon name="eye" /> Read
          </>
        ),
      },
      {
        key: "saved",
        label: (
          <>
            <Icon name={BOOKMARK_ICON_NAME} /> Saved for later
          </>
        ),
      },
      { key: "all", label: "@ All mentions" },
    ],
    type: "group",
  },
  { key: "d1", type: "divider" },
  {
    key: "news",
    label: (
      <Text strong style={{ fontSize: "125%" }}>
        News <NewsCounter />
      </Text>
    ),
    children: [
      {
        key: "allNews",
        label: (
          <>
            <Text strong>
              <Icon name="mail" /> All news
            </Text>
          </>
        ),
      },
      ...CHANNELS.map((c) => ({
        key: c,
        label: (
          <>
            <Icon name={CHANNELS_ICONS[c]} /> {capitalize(c)}
          </>
        ),
      })),
    ],
    type: "group",
  },
];

interface Props {
  filter: NotificationFilter;
  on_click: (label: NotificationFilter) => void;
  style: React.CSSProperties;
}

export function NotificationNav(props: Props) {
  const { filter, on_click, style } = props;

  return (
    <Menu
      onClick={(e) => on_click(e.key as NotificationFilter)}
      style={style}
      selectedKeys={[filter]}
      mode="inline"
      items={ITEMS}
    />
  );
}
