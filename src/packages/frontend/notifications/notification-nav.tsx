/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Menu } from "antd";
import React from "react";
import { capitalize } from "lodash";

import { NotificationFilter } from "./mentions/types";
import { Icon, Text } from "@cocalc/frontend/components";
import { CHANNELS, CHANNELS_ICONS } from "@cocalc/util/types/news";
import { BOOKMARK_ICON_NAME } from "./mentions/util";

const ITEMS = [
  {
    key: "mentions",
    label: (
      <Text strong style={{ fontSize: "125%" }}>
        @-Mentions
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
        News
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
      defaultSelectedKeys={[filter]}
      mode="inline"
      items={ITEMS}
    />
  );
}
