import * as React from "react";
const { Nav, NavItem } = require("react-bootstrap");

export function NotificationNav() {
  return (
    <Nav>
      <NavItem>Mentions</NavItem>
      <NavItem>All Notifications</NavItem>
    </Nav>
  );
}
