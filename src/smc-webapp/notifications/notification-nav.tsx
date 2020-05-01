/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as React from "react";
import { MentionFilter } from "./mentions/types";
const { Nav, NavItem } = require("react-bootstrap");

export function NotificationNav({
  filter,
  on_click,
  style,
}: {
  filter: MentionFilter;
  on_click: (label: MentionFilter) => void;
  style: React.CSSProperties;
}) {
  return (
    <Nav
      bsStyle="pills"
      activeKey={filter}
      onSelect={on_click}
      stacked={true}
      style={style}
    >
      <NavItem eventKey={"unread"}>Unread</NavItem>
      <NavItem eventKey={"read"}>Read</NavItem>
      <NavItem eventKey={"saved"}>Saved for later</NavItem>
      <NavItem eventKey={"all"}>All mentions</NavItem>
    </Nav>
  );
}
