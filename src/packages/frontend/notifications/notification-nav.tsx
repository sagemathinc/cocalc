/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Menu } from "antd";
import React from "react";

import { MentionFilter } from "./mentions/types";

const ITEMS = [
  { key: "unread", label: "Unread" },
  { key: "read", label: "Read" },
  { key: "saved", label: "Saved for later" },
  { key: "all", label: "All mentions" },
];

interface Props {
  filter: MentionFilter;
  on_click: (label: MentionFilter) => void;
  style: React.CSSProperties;
}

export function NotificationNav(props: Props) {
  const { filter, on_click, style } = props;

  return (
    <Menu
      onClick={(e) => on_click(e.key as MentionFilter)}
      style={style}
      defaultSelectedKeys={[filter]}
      mode="inline"
      items={ITEMS}
    />
  );
}
