/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import React from "react";

import { Button, Collapse, Space } from "antd";
const { Panel } = Collapse;

import { CSS, redux } from "@cocalc/frontend/app-framework";
import { Icon, MarkAll } from "@cocalc/frontend/components";
import { ProjectTitle } from "@cocalc/frontend/projects/project-title";
import { unreachable } from "@cocalc/util/misc";
import { MentionRow } from "./mentions/mention-row";
import { MentionFilter, MentionsMap } from "./mentions/types";
import { BOOKMARK_ICON_NAME } from "./mentions/util";
import { NoNewNotifications } from "./no-new-notifications";

interface Props {
  account_id: string;
  mentions: MentionsMap;
  filter: MentionFilter;
  style: CSS;
  user_map;
}

export const NotificationList: React.FC<Props> = (props: Props) => {
  const { account_id, mentions, filter, style, user_map } = props;

  if (mentions == undefined || mentions.size == 0) {
    return <NoMentions filter={filter} style={style} />;
  }

  function markRead(project_id: string, filter: "read" | "unread") {
    const actions = redux.getActions("mentions");
    actions.markAll(project_id, filter);
  }

  function saveAll(project_id: string, filter: "read" | "unread") {
    const actions = redux.getActions("mentions");
    actions.saveAll(project_id, filter);
  }

  function renderMarkAll(project_id: string) {
    if (filter === "saved" || filter === "all") return null;
    const opposite: MentionFilter = filter === "read" ? "unread" : "read";
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

  const mentions_per_project: any = {};
  const project_panels: any = [];
  const project_id_order: string[] = [];

  mentions
    .filter((notification) => notification.get("target") === account_id)
    .filter((notification) => {
      const status = notification.getIn(["users", account_id])?.toJS() ?? {
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
    .map((notification, id) => {
      const path = notification.get("path");
      const time = notification.get("time");
      const project_id = notification.get("project_id");
      if (mentions_per_project[project_id] == undefined) {
        mentions_per_project[project_id] = [];
        project_id_order.push(project_id);
      }
      mentions_per_project[project_id].push(
        <MentionRow
          filter={filter}
          key={path + time.getTime()}
          id={id}
          mention={notification}
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
    <div className={"smc-notificationlist"} style={style}>
      <Space direction="vertical" size="large">
        {project_panels}
      </Space>
    </div>
  );
};

function NoMentions({ filter, style }: { filter: MentionFilter; style: CSS }) {
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
    default:
      unreachable(filter);
  }
  return <NoNewNotifications text={text} style={style} />;
}
