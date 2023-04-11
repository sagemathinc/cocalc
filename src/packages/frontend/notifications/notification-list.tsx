/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Button, Card, Collapse, List, Space } from "antd";
import React, { useMemo } from "react";

const { Panel } = Collapse;

import {
  CSS,
  redux,
  useActions,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import {
  Icon,
  MarkAll,
  Text,
  TimeAgo,
  Title,
} from "@cocalc/frontend/components";
import { BASE_URL, open_new_tab } from "@cocalc/frontend/misc";
import { ProjectTitle } from "@cocalc/frontend/projects/project-title";
import { cmp_Date, unreachable } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { CHANNELS_ICONS } from "@cocalc/util/types/news";
import { MentionRow } from "./mentions/mention-row";
import { MentionsMap, NotificationFilter } from "./mentions/types";
import { BOOKMARK_ICON_NAME } from "./mentions/util";
import { NewsMap, isNewsFilter } from "./news/types";
import { NoNewNotifications } from "./no-new-notifications";

interface Props {
  account_id: string;
  mentions: MentionsMap;
  news: NewsMap;
  filter: NotificationFilter;
  style: CSS;
  user_map;
}

export const NotificationList: React.FC<Props> = (props: Props) => {
  const { account_id, mentions, news, filter, style, user_map } = props;
  const mentions_actions = redux.getActions("mentions");
  const news_actions = useActions("news");
  const news_unread = useTypedRedux("news", "unread");

  const newsData = useMemo(() => {
    // weird: using news.valueSeq().toJS() makes object reappear, which were overwritten when an update came in!?
    return Object.values(news.toJS())
      .filter((n) => {
        if (!isNewsFilter(filter)) return false;
        if (filter === "allNews") {
          return true;
        } else {
          return n.channel === filter;
        }
      })
      .sort((a, b) => -cmp_Date(a.date, b.date));
  }, [news, filter]);

  if (mentions == undefined || mentions.size == 0) {
    return <NoMentions filter={filter} style={style} />;
  }

  function markRead(project_id: string, filter: "read" | "unread") {
    mentions_actions.markAll(project_id, filter);
  }

  function saveAll(project_id: string, filter: "read" | "unread") {
    mentions_actions.saveAll(project_id, filter);
  }

  function renderMarkAll(project_id: string) {
    if (isNewsFilter(filter)) return null;
    if (filter === "saved" || filter === "all") return null;

    const opposite: NotificationFilter = filter === "read" ? "unread" : "read";
    return (
      <Space direction="horizontal" size="small">
        <MarkAll<"read" | "unread">
          how={opposite}
          size="small"
          onClick={(how) => markRead(project_id, how)}
        />
        <Button
          onClick={(e) => {
            e.stopPropagation();
            saveAll(project_id, filter);
          }}
          size="small"
        >
          <Icon name={BOOKMARK_ICON_NAME} /> Save all
        </Button>
      </Space>
    );
  }

  function renderNewsPanelExtra(): JSX.Element {
    if (news_unread ?? 0 > 0) {
      return (
        <Button onClick={() => news_actions.markNewsRead()} type="primary">
          <Icon name="check-square" /> Mark news read
        </Button>
      );
    } else {
      return (
        <Button onClick={() => news_actions.markNewsUnread()}>
          <Icon name="square" /> Mark news unread
        </Button>
      );
    }
  }

  function renderNewsPanel() {
    return (
      <Card
        title={<Title level={4}>News</Title>}
        extra={renderNewsPanelExtra()}
        headStyle={{ backgroundColor: COLORS.GRAY_LLL }}
      >
        <List
          itemLayout="horizontal"
          size="small"
          dataSource={newsData}
          renderItem={(n) => {
            const url = `${BASE_URL}/news/${n.id}`;
            return (
              <List.Item
                key={n.id}
                onClick={(e) => {
                  e.stopPropagation();
                  open_new_tab(url);
                }}
                actions={[
                  <Button
                    key="read"
                    type="ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      open_new_tab(url);
                    }}
                  >
                    <Icon name="external-link" />
                  </Button>,
                ]}
              >
                <List.Item.Meta
                  title={
                    <Text strong>
                      <Icon name={CHANNELS_ICONS[n.channel]} /> {n.title}
                    </Text>
                  }
                />
                <TimeAgo date={n.date} />
              </List.Item>
            );
          }}
        />
      </Card>
    );
  }

  function renderMentionsPanel() {
    if (isNewsFilter(filter)) throw Error("Should be in renderNewsPanel");

    const mentions_per_project: any = {};
    const project_panels: any = [];
    const project_id_order: string[] = [];

    mentions
      .filter((m) => m.get("target") === account_id)
      .filter((m) => {
        const status = m.getIn(["users", account_id])?.toJS() ?? {
          read: false,
          saved: false,
        };

        switch (filter) {
          case "unread":
            return status.read === false;
          case "read":
            return status.read === true;
          case "saved":
            return status.saved === true;
          case "all":
            return true;
          default:
            unreachable(filter);
        }
      })
      .map((m, id) => {
        const path = m.get("path");
        const time = m.get("time");
        const project_id = m.get("project_id");
        if (mentions_per_project[project_id] == undefined) {
          mentions_per_project[project_id] = [];
          project_id_order.push(project_id);
        }
        mentions_per_project[project_id].push(
          <MentionRow
            filter={filter}
            key={path + time.getTime()}
            id={id}
            mention={m}
            user_map={user_map}
          />
        );
      });

    // Check if this user has only made mentions and no one has mentioned them
    if (project_id_order.length == 0) {
      return <NoMentions filter={filter} style={style} />;
    }

    for (const project_id of project_id_order) {
      project_panels.push(
        <Collapse
          defaultActiveKey={project_id_order}
          key={project_id}
          className="cocalc-notification-list"
        >
          <Panel
            key={project_id}
            header={<ProjectTitle project_id={project_id} />}
            extra={renderMarkAll(project_id)}
          >
            <ul>{mentions_per_project[project_id]}</ul>
          </Panel>
        </Collapse>
      );
    }

    return (
      <Space direction="vertical" size="large">
        {project_panels}
      </Space>
    );
  }

  return (
    <div className={"smc-notificationlist"} style={style}>
      {isNewsFilter(filter) ? renderNewsPanel() : renderMentionsPanel()}
    </div>
  );
};

function NoMentions({
  filter,
  style,
}: {
  filter: NotificationFilter;
  style: CSS;
}) {
  let text = "No new mentions";
  switch (filter) {
    case "unread":
      text = "No unread mentions";
      break;
    case "read":
      text = "No read mentions";
      break;
    case "saved":
      text = "No saved mentions";
      break;
    case "all":
      text = "No mentions";
      break;
    case "allNews":
    case "announcement":
    case "platform":
    case "feature":
    case "about":
      text = "No news";
      break;
    default:
      unreachable(filter);
  }
  return <NoNewNotifications text={text} style={style} />;
}
