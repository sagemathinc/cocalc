import * as React from "react";
import { NotificationNav } from "./notification-nav";
import { NotificationList } from "./notification-list";

export function NotificationPage() {
  return (
    <div>
      <NotificationNav />
      <NotificationList />
    </div>
  );
}
