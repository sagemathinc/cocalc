import * as React from "react";

import { NotificationRow } from "./notification-row";

import { redux } from "../app-framework";

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
  display: "flex",
  flexDirection: "column"
};

export function NotificationList() {
  const store = redux.getStore("mentions");
  if (store == undefined) {
    return null;
  }
  const account_id = redux.getStore("account").get("account_id");
  const mentions = store.get("mentions");
  if (mentions == undefined) {
    return null;
  }
  let list: any = [];

  mentions.map(notification => {
    const { path, project_id, source, target, time } = notification.toJS();
    if (true || target == account_id) {
      list.push(
        <NotificationRow
          key={path + time.getTime()}
          account_id={source}
          timestamp={time.getTime()}
          project_id={project_id}
          path={path}
        />
      );
    }
  });

  return <div style={notification_list_style}>{list}</div>;
}
