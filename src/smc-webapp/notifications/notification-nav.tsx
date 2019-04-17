import * as React from "react";
const { Nav, NavItem } = require("react-bootstrap");

export function NotificationNav({ style }) {
  return (
    <Nav bsStyle="pills" activeKey={1} stacked style={style}>
      <NavItem eventKey={1}>Unread</NavItem>
      <NavItem eventKey={2}>Read</NavItem>
      <NavItem eventKey={3}>Saved for Later</NavItem>
    </Nav>
  );
}
