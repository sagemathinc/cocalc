/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { blue as ANTD_BLUE } from "@ant-design/colors";
import { Badge, Menu } from "antd";
import React, { useMemo } from "react";
import { defineMessage, useIntl } from "react-intl";

import { redux, useTypedRedux } from "@cocalc/frontend/app-framework";
import { Icon, IconName, MenuItems, Text } from "@cocalc/frontend/components";
import { IntlMessage, labels } from "@cocalc/frontend/i18n";
import { ComposeButton } from "@cocalc/frontend/messages/compose";
import MessagesCounter from "@cocalc/frontend/messages/counter";
import { COLORS } from "@cocalc/util/theme";
import { Channel, CHANNELS, CHANNELS_ICONS } from "@cocalc/util/types/news";
import { NotificationFilter } from "./mentions/types";
import { BOOKMARK_ICON_NAME } from "./mentions/util";
import { MSGS } from "./notification-i18n";

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
    return mentions_store.getUnreadSize();
  }, [mentions]);

  return (
    <Badge
      color={count == 0 ? COLORS.GRAY : undefined}
      showZero={true}
      count={count}
    />
  );
};

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
            {intl.formatMessage(labels.messages)} <MessagesCounter />
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
            <div style={{ display: "flex", width: "100%" }}>
              <span style={{ textOverflow: "ellipsis", overflow: "hidden" }}>
                <Icon name="container" />{" "}
                {intl.formatMessage(labels.messages_inbox)}
              </span>
              <div style={{ flex: 1 }} />
              <MessagesCounter minimal />
            </div>
          ),
        },
        {
          key: "messages-sent",
          label: (
            <span style={{ textOverflow: "ellipsis", overflow: "hidden" }}>
              <Icon name={"paper-plane"} />{" "}
              {intl.formatMessage(labels.messages_sent)}
            </span>
          ),
        },
        {
          key: "messages-drafts",
          label: (
            <span style={{ textOverflow: "ellipsis", overflow: "hidden" }}>
              <Icon name="note" /> {intl.formatMessage(labels.drafts)}
            </span>
          ),
        },
        {
          key: "messages-starred",
          label: (
            <span style={{ textOverflow: "ellipsis", overflow: "hidden" }}>
              <Icon name="star" /> {intl.formatMessage(labels.starred)}
            </span>
          ),
        },
        {
          key: "messages-all",
          label: (
            <span style={{ textOverflow: "ellipsis", overflow: "hidden" }}>
              <Icon name="mail" />{" "}
              {intl.formatMessage(labels.messages_all_messages)}
            </span>
          ),
        },
        {
          key: "messages-search",
          label: (
            <span style={{ textOverflow: "ellipsis", overflow: "hidden" }}>
              <Icon name="search" /> {intl.formatMessage(labels.search)}
            </span>
          ),
        },
        {
          key: "messages-trash",
          label: (
            <span style={{ textOverflow: "ellipsis", overflow: "hidden" }}>
              <Icon name="trash" /> {intl.formatMessage(labels.trash)}
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
