import * as React from "react";

import { MentionsMap, MentionFilter } from "./mentions/types";
import { MentionRow } from "./mentions/mention-row";

import { NoNewNotifications } from "./no-new-notifications";

const { ProjectTitle } = require("../projects");

const { Panel } = require("react-bootstrap");

function assertNever(x: never): never {
  throw new Error("Unexpected filter: " + x);
}

export function NotificationList({
  account_id,
  mentions,
  filter,
  style,
  user_map
}: {
  account_id: string;
  mentions: MentionsMap;
  filter: MentionFilter;
  style: React.CSSProperties;
  user_map: any;
}) {
  if (mentions == undefined || mentions.size == 0) {
    return <NoMentions filter={filter} style={style} />;
  }
  const mentions_per_project: any = {};
  const project_panels: any = [];
  const project_id_order: string[] = [];

  mentions
    .filter(notification => notification.get("target") === account_id)
    .filter(notification => {
      const status = notification.getIn(["users", account_id])?.toJS() ?? {
        read: false,
        saved: false
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
          assertNever(filter);
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
      <Panel
        key={project_id}
        header={<ProjectTitle project_id={project_id} />}
      >
        <ul>{mentions_per_project[project_id]}</ul>
      </Panel>
    );
  }

  return (
    <div
      className={"smc-notificationlist"}
      style={Object.assign({}, notification_list_style, style)}
    >
      {project_panels}
    </div>
  );
}

function NoMentions({
  filter,
  style
}: {
  filter: MentionFilter;
  style: React.CSSProperties;
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
      text = "No saved Mentions";
      break;
    case "all":
      text = "No mentions";
      break;
    default:
      assertNever(filter);
  }
  return <NoNewNotifications text={text} style={style} />;
}

const notification_list_style: React.CSSProperties = {
  height: "100%",
  width: "100%",
  padding: "0px"
};
