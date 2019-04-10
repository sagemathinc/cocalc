import * as React from "react";

import { MentionRow } from "./mention-row";

import { redux } from "../app-framework";

const { ProjectTitleAuto } = require("../projects");

const { Panel } = require("react-bootstrap");

/*

type User = any; //todo

type UserNotificationAction = "edit" | "comment" | "invite" | "mention" | "create" | "upload" | "delete"

interface Notification {
  users: User[];
  last_edited: any; // Number?
  project_id: string;
  path: string;
  show_chat?: boolean;
  is_unread: boolean;
  notify: any; // boolean?
}

interface Props {
  notifications: {account_id: string}[]
}
*/

const notification_list_style: React.CSSProperties = {
  height: "100%",
  width: "100%",
  padding: "0px"
};

export function NotificationList({ style }) {
  const store = redux.getStore("mentions");
  if (store == undefined) {
    return null;
  }
  const mentions = store.get("mentions");
  if (mentions == undefined) {
    return null;
  }
  const account_id = redux.getStore("account").get("account_id");
  let mentions_per_project: any = {};
  let project_panels: any = [];

  mentions.map(notification => {
    const { path, project_id, source, target, time } = notification.toJS();
    if (target == account_id) {
      if (mentions_per_project[project_id] == undefined) {
        mentions_per_project[project_id] = [];
      }
      mentions_per_project[project_id].push(
        <MentionRow
          key={path + time.getTime()}
          account_id={source}
          timestamp={time.getTime()}
          project_id={project_id}
          path={path}
        />
      );
    }
  });

  const entries = Object.entries(mentions_per_project);
  for (const [project_id, mention_rows] of entries) {
    project_panels.push(
      <Panel
        key={project_id}
        header={<ProjectTitleAuto project_id={project_id} />}
      >
        <ul>{mention_rows}</ul>
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
