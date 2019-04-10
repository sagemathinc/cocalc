import * as React from "react";
import { NotificationNav } from "./notification-nav";
import { NotificationList } from "./notification-list";

export function NotificationPage() {
  return (
    <div style={container_style}>
      <NotificationNav style={nav_style} />
      <NotificationList style={list_style} />
    </div>
  );
}

const container_style: React.CSSProperties = {
  display: "flex"
};

const nav_style: React.CSSProperties = {
  margin: "15px"
};

const list_style: React.CSSProperties = {
  flex: "1",
  margin: "15px"
};
