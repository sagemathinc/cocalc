/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import type { MenuProps } from "antd";
import { ReactNode } from "react";

import AIAvatar from "@cocalc/frontend/components/ai-avatar";
import { Icon, isIconName } from "@cocalc/frontend/components/icon";

export type MenuItem = Required<MenuProps>["items"][number];
export type MenuItems = MenuItem[];

export function menuItem(
  key: React.Key,
  label: React.ReactNode,
  icon?: React.ReactNode | string,
  children?: MenuItem[],
  danger?: boolean,
): MenuItem {
  if (typeof icon === "string") {
    if (isIconName(icon)) {
      icon = <Icon name={icon} />;
    } else if (icon === "ai") {
      icon = (
        <AIAvatar size={18} style={{ position: "relative", top: "-12px" }} />
      );
    }
  }
  return {
    key,
    icon,
    children,
    label,
    danger,
  } as MenuItem;
}

export function menuGroup(
  key: React.Key,
  label: React.ReactNode,
  children: MenuItem[],
  icon?: ReactNode,
): MenuItem {
  return {
    key,
    children,
    label,
    type: "group",
    icon,
  } as MenuItem;
}
