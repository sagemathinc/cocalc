import * as React from "react";
const { Nav, NavItem } = require("react-bootstrap");

export function NotificationNav({ style }) {
  return (
    <Nav bsStyle="pills" activeKey={1} style={style}>
      <NavItem eventKey={1}>Mentions</NavItem>
    </Nav>
  );
}
