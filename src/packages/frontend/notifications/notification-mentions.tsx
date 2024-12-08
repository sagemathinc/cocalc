/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Button, Collapse, Space } from "antd";
const { Panel } = Collapse;
import { CSS, redux } from "@cocalc/frontend/app-framework";
import { Icon, MarkAll } from "@cocalc/frontend/components";
import { ProjectTitle } from "@cocalc/frontend/projects/project-title";
import { unreachable } from "@cocalc/util/misc";
import { MentionRow } from "./mentions/mention-row";
import {
  MentionsFilter,
  MentionsMap,
  NotificationFilter,
} from "./mentions/types";
import { BOOKMARK_ICON_NAME } from "./mentions/util";
import { isNewsFilter } from "./news/types";
import { NoMentions } from "./notification-no-mentions";

interface MentionsPanelProps {
  filter: MentionsFilter;
  mentions: MentionsMap;
  user_map;
  account_id: string;
  style: CSS;
}

export function MentionsPanel(props: MentionsPanelProps) {
  const { filter, mentions, user_map, account_id, style } = props;
  const mentions_actions = redux.getActions("mentions");

  if (isNewsFilter(filter)) {
    throw Error("Should be in NewsPanel");
  }

  if (!isNewsFilter(filter) && (mentions == undefined || mentions.size == 0)) {
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
        <MarkAll
          how={opposite}
          size="small"
          onClick={(how: "read" | "unread") => markRead(project_id, how)}
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

  // TODO this is old code, should be refactored

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
        />,
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
      </Collapse>,
    );
  }

  return (
    <Space direction="vertical" size="large">
      {project_panels}
    </Space>
  );
}
