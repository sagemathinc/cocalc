import * as React from "react";

import { MentionRow } from "./mention-row";

import { NoNewNotifications } from "./no-new-notifications";

const { ProjectTitleAuto } = require("../projects");

const { Panel } = require("react-bootstrap");

export function NotificationList({ account_id, mentions, style, user_map }) {
  if (mentions == undefined || mentions.size == 0) {
    console.log("No mentions found");
    if (mentions != undefined) {
      console.log(mentions.toJS());
    } else {
      console.log("mentions is undefined");
    }
    return <NoNewNotifications name="mentions" style={style} />;
  }
  let mentions_per_project: any = {};
  let project_panels: any = [];
  let project_id_order: string[] = [];

  mentions.map(notification => {
    const path = notification.get("path");
    const time = notification.get("time");
    const project_id = notification.get("project_id");
    const target = notification.get("target");

    if (target == account_id) {
      if (mentions_per_project[project_id] == undefined) {
        mentions_per_project[project_id] = [];
        project_id_order.push(project_id);
      }
      mentions_per_project[project_id].push(
        <MentionRow
          key={path + time.getTime()}
          mention={notification}
          user_map={user_map}
        />
      );
    }
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
