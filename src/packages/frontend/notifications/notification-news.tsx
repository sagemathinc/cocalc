/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Button, Card, List, Space, Tag } from "antd";
import React, { useMemo, useRef } from "react";
import { delay } from "awaiting";

import {
  useActions,
  useAsyncEffect,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import {
  Icon,
  IconName,
  Text,
  TimeAgo,
  Title,
} from "@cocalc/frontend/components";
import { BASE_URL, open_new_tab } from "@cocalc/frontend/misc";
import { cmp_Date, getRandomColor } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { CHANNELS_ICONS, NewsItemWebapp } from "@cocalc/util/types/news";
import { NewsFilter, NewsMap, isNewsFilter } from "./news/types";

interface NewsPanelProps {
  news: NewsMap;
  filter: NewsFilter;
}

export function NewsPanel(props: NewsPanelProps) {
  const { news, filter } = props;
  const news_actions = useActions("news");
  const news_unread = useTypedRedux("news", "unread");
  const account_other = useTypedRedux("account", "other_settings");
  const news_read_until: number | undefined =
    account_other?.get("news_read_until");
  const didClickUnread = useRef<boolean>(false);

  // after showing news briefly (short), we mark them as read.
  // even if they didn't read them, the user saw there is something and
  // in the future, new news items will show up as (1) annotations
  // (more visible than changing the number)
  useAsyncEffect(async (isMounted) => {
    await delay(1500);
    if (!isMounted()) return;
    // we block this in case the user did click "unread" in the meantime, just silly otherwise
    if (didClickUnread.current) return;
    // we also abort if no longer looking at news
    if (!isNewsFilter(filter)) return;
    news_actions.markNewsRead();
  }, []);

  const newsData: NewsItemWebapp[] = useMemo(() => {
    if (!isNewsFilter(filter)) return [];
    const now = webapp_client.server_time();
    // weird: using news.valueSeq().toJS() makes object reappear, which were overwritten when an update came in!?
    return Object.values(news.toJS())
      .filter((n) => {
        if (n.hide ?? false) return false;
        if (n.date > now) return false;
        if (!isNewsFilter(filter)) return false;
        if (filter === "allNews") {
          return true;
        } else {
          return n.channel === filter;
        }
      })
      .sort((a, b) => -cmp_Date(a.date, b.date));
  }, [news, filter]);

  // If a user clicks on a news item, we assume they saw all news up until that point.
  // (and even if not, it's fine, they don't vanish)
  function newsItemOnClick(e: React.MouseEvent, news: NewsItemWebapp) {
    const { id, date } = news;
    e.stopPropagation();
    const url = `${BASE_URL}/news/${id}`;
    news_actions.markNewsRead({ date, current: news_read_until });
    open_new_tab(url);
  }

  function renderTags(tags?: string[]) {
    if (tags == null) return null;
    return (
      <span style={{ paddingLeft: "10px" }}>
        {tags.sort().map((tag) => (
          <Tag
            key={tag}
            color={getRandomColor(tag)}
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              open_new_tab(`${BASE_URL}/news?tag=${tag}`);
            }}
          >
            {tag}
          </Tag>
        ))}
      </span>
    );
  }

  function renderNewsPanelExtra(): JSX.Element {
    return (
      <Space direction="horizontal">
        <Button href={`${BASE_URL}/news`} target="_blank">
          <Icon name="file-alt" /> Read All
        </Button>
        {news_unread ?? 0 > 0 ? (
          <Button onClick={() => news_actions.markNewsRead()} type="primary">
            <Icon name="check-square" /> Mark all read
          </Button>
        ) : (
          <Button
            onClick={() => {
              didClickUnread.current = true;
              news_actions.markNewsUnread();
            }}
          >
            <Icon name="square" /> Mark all unread
          </Button>
        )}
      </Space>
    );
  }

  function renderNewsItem(n: NewsItemWebapp) {
    const { id, title, channel, date, tags } = n;
    const icon = CHANNELS_ICONS[channel] as IconName;
    const isUnread =
      news_read_until == null || date.getTime() > news_read_until;
    return (
      <List.Item
        key={id}
        onClick={(e) => newsItemOnClick(e, n)}
        style={{
          backgroundColor: isUnread ? COLORS.ANTD_BG_BLUE_L : undefined,
        }}
        actions={[
          <Button
            key="read"
            type="ghost"
            onClick={(e) => newsItemOnClick(e, n)}
          >
            <Icon name="external-link" />
          </Button>,
        ]}
      >
        <List.Item.Meta
          title={
            <Text strong>
              <Icon name={icon} /> {title} {renderTags(tags)}
            </Text>
          }
        />
        <TimeAgo date={date} />
      </List.Item>
    );
  }

  return (
    <Card
      title={<Title level={4}>News</Title>}
      extra={renderNewsPanelExtra()}
      headStyle={{ backgroundColor: COLORS.GRAY_LLL }}
      bodyStyle={{ padding: "0px" }}
    >
      <List
        itemLayout="horizontal"
        size="small"
        dataSource={newsData}
        renderItem={renderNewsItem}
        pagination={{ position: "bottom", pageSize: 10 }}
      />
    </Card>
  );
}
