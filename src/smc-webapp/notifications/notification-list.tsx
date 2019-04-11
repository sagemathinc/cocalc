import * as React from "react";

import { MentionRow } from "./mention-row";

const { ProjectTitleAuto } = require("../projects");

const { Panel } = require("react-bootstrap");

const notification_list_style: React.CSSProperties = {
  height: "100%",
  width: "100%",
  padding: "0px"
};

export function NotificationList({ account_id, mentions, style, user_map }) {
  if (mentions == undefined) {
    return null;
  }
  let mentions_per_project: any = {};
  let project_panels: any = [];
  let project_id_order: string[] = [];

  mentions.map(notification => {
    const {
      path,
      project_id,
      source,
      target,
      time,
      description
    } = notification.toJS();
    if (target == account_id) {
      if (mentions_per_project[project_id] == undefined) {
        mentions_per_project[project_id] = [];
        project_id_order.push(project_id);
      }
      mentions_per_project[project_id].push(
        <MentionRow
          key={path + time.getTime()}
          account_id={source}
          timestamp={time.getTime()}
          project_id={project_id}
          path={path}
          description={description}
          user_map={user_map}
        />
      );
    }
  });

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
