/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { blue as ANTD_BLUE } from "@ant-design/colors";
import { Badge, Menu } from "antd";
import React, { useMemo } from "react";
import { defineMessage, defineMessages, useIntl } from "react-intl";
import { redux, useTypedRedux } from "@cocalc/frontend/app-framework";
import { Icon, IconName, MenuItems, Text } from "@cocalc/frontend/components";
import { COLORS } from "@cocalc/util/theme";
import { Channel, CHANNELS, CHANNELS_ICONS } from "@cocalc/util/types/news";
import { IntlMessage } from "../i18n";
import { NotificationFilter } from "./mentions/types";
import { BOOKMARK_ICON_NAME } from "./mentions/util";
import MessagesCounter from "@cocalc/frontend/messages/counter";
import { ComposeButton } from "@cocalc/frontend/messages/compose";

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

const MSGS = defineMessages({
  mentions: {
    id: "notifications.nav.mentions",
    defaultMessage: "Mentions",
  },
  unread: {
    id: "notifications.nav.unread",
    defaultMessage: "Unread",
    description: "Label for unread messages",
  },
  read: {
    id: "notifications.nav.read",
    defaultMessage: "Read",
    description: "Label for messages that have been read",
  },
  saved: {
    id: "notifications.nav.saved",
    defaultMessage: "Saved for Later",
    description: "Label for messages saved for later",
  },
  all: {
    id: "notifications.nav.all",
    defaultMessage: "All Mentions",
  },
  news: {
    id: "notifications.nav.news",
    defaultMessage: "News",
  },
  allNews: {
    id: "notifications.nav.allNews",
    defaultMessage: "All News",
  },
});

const CHANNELS_NAMES: { [name in Channel]: IntlMessage } = {
  announcement: defineMessage({
    id: "news.nav.announcement.name",
    defaultMessage: "Announcement",
  }),
  feature: defineMessage({
    id: "news.nav.feature.name",
    defaultMessage: "Feature",
  }),
  event: defineMessage({ id: "news.nav.event.name", defaultMessage: "Event" }),
  platform: defineMessage({
    id: "news.nav.platform.name",
    defaultMessage: "Platform",
  }),
  about: defineMessage({ id: "news.nav.about.name", defaultMessage: "About" }),
} as const;

interface Props {
  filter: NotificationFilter;
  on_click: (label: NotificationFilter) => void;
  style: React.CSSProperties;
}

export function NotificationNav({ filter, on_click, style }: Props) {
  const intl = useIntl();

  const ITEMS: MenuItems = [
    {
      key: "messages",
      label: (
        <div
          style={{
            margin:
              "0 -12px" /* weird margin is so the compose button lines up with the items */,
          }}
        >
          <Text strong style={{ fontSize: "125%", marginLeft: "12px" }}>
            Messages <MessagesCounter />
          </Text>
          <ComposeButton
            size="large"
            style={{ marginTop: "15px", width: "100%" }}
          />
        </div>
      ),
      children: [
        {
          key: "messages-inbox",
          label: (
            <span style={{ textOverflow: "ellipsis", overflow: "hidden" }}>
              <Icon name="container" /> Inbox
            </span>
          ),
        },
        {
          key: "messages-sent",
          label: (
            <span style={{ textOverflow: "ellipsis", overflow: "hidden" }}>
              <Icon name={"paper-plane"} /> Sent
            </span>
          ),
        },
        {
          key: "messages-drafts",
          label: (
            <span style={{ textOverflow: "ellipsis", overflow: "hidden" }}>
              <Icon name="note" /> Drafts
            </span>
          ),
        },
        {
          key: "messages-all",
          label: (
            <span style={{ textOverflow: "ellipsis", overflow: "hidden" }}>
              <Icon name="comments" /> All Messages
            </span>
          ),
        },
        {
          key: "messages-search",
          label: (
            <span style={{ textOverflow: "ellipsis", overflow: "hidden" }}>
              <Icon name="search" /> Search
            </span>
          ),
        },
        {
          key: "messages-trash",
          label: (
            <span style={{ textOverflow: "ellipsis", overflow: "hidden" }}>
              <Icon name="trash" /> Trash
            </span>
          ),
        },
      ],
      type: "group",
    },
    { key: "divider-before-mentions", type: "divider" },
    {
      key: "mentions",
      label: (
        <Text strong style={{ fontSize: "125%" }}>
          @-{intl.formatMessage(MSGS.mentions)} <MentionsCounter />
        </Text>
      ),
      children: [
        {
          key: "unread",
          label: (
            <span style={{ textOverflow: "ellipsis", overflow: "hidden" }}>
              <Icon name="eye-slash" /> {intl.formatMessage(MSGS.unread)}
            </span>
          ),
        },
        {
          key: "read",
          label: (
            <span style={{ textOverflow: "ellipsis", overflow: "hidden" }}>
              <Icon name="eye" /> {intl.formatMessage(MSGS.read)}
            </span>
          ),
        },
        {
          key: "saved",
          label: (
            <span style={{ textOverflow: "ellipsis", overflow: "hidden" }}>
              <Icon name={BOOKMARK_ICON_NAME} />{" "}
              {intl.formatMessage(MSGS.saved)}
            </span>
          ),
        },
        {
          key: "all",
          label: (
            <span style={{ textOverflow: "ellipsis", overflow: "hidden" }}>
              @ {intl.formatMessage(MSGS.all)}
            </span>
          ),
        },
      ],
      type: "group",
    },
    { key: "divider-before-news", type: "divider" },
    {
      key: "news",
      label: (
        <Text strong style={{ fontSize: "125%" }}>
          {intl.formatMessage(MSGS.news)} <NewsCounter />
        </Text>
      ),
      children: [
        {
          key: "allNews",
          label: (
            <span style={{ textOverflow: "ellipsis", overflow: "hidden" }}>
              <Text strong>
                <Icon name="mail" /> {intl.formatMessage(MSGS.allNews)}
              </Text>
            </span>
          ),
        },
        ...CHANNELS.filter((c) => c !== "event").map((c) => ({
          key: c,
          label: (
            <span style={{ textOverflow: "ellipsis", overflow: "hidden" }}>
              <Icon name={CHANNELS_ICONS[c] as IconName} />{" "}
              {intl.formatMessage(CHANNELS_NAMES[c])}
            </span>
          ),
        })),
      ],
      type: "group",
    },
  ];

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
