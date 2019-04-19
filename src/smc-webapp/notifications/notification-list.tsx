import * as React from "react";
import { Map } from "immutable";

import { MentionsMap, MentionFilter } from "./mentions/types";
import { MentionRow } from "./mentions/mention-row";

import { NoNewNotifications } from "./no-new-notifications";

const { ProjectTitleAuto } = require("../projects");

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
    return <NoNewNotifications name="mentions" style={style} />;
  }
  let mentions_per_project: any = {};
  let project_panels: any = [];
  let project_id_order: string[] = [];

  mentions
    .filter(notification => notification.get("target") === account_id)
    .filter(notification => {
      const status =
        notification.getIn(["users", account_id]) ||
        Map({ read: false, saved: false });

      switch (filter) {
        case "unread":
          return status.get("read") === false;
        case "read":
          return status.get("read") === true;
        case "saved":
          return status.get("saved") === true;
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
    return <NoNewNotifications name="mentions" style={style} />;
  }

  for (const project_id of project_id_order) {
    project_panels.push(
      <Panel
        key={project_id}
        header={<ProjectTitleAuto project_id={project_id} />}
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

const notification_list_style: React.CSSProperties = {
  height: "100%",
  width: "100%",
  padding: "0px"
};
