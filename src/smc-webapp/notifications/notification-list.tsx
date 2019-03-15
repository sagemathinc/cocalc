import * as React from "react";

import { NotificationRow } from "./notification-row";

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
  return (
    <div style={notification_list_style}>
      <NotificationRow />
      <NotificationRow />
      <NotificationRow />
      <NotificationRow />
      <NotificationRow />
      <NotificationRow />
      <NotificationRow />
      <NotificationRow />
    </div>
  );
}
