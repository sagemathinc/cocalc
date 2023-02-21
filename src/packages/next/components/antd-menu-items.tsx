/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import type { MenuProps } from "antd";

import { Icon, isIconName } from "@cocalc/frontend/components/icon";
import { ReactNode } from "react";

export type MenuItem = Required<MenuProps>["items"][number];
export type MenuItems = MenuItem[];

export function menuItem(
  key: React.Key,
  label: React.ReactNode,
  icon?: React.ReactNode | string,
  children?: MenuItem[],
  danger?: boolean
): MenuItem {
  if (typeof icon === "string" && isIconName(icon)) {
    icon = <Icon name={icon} />;
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
  icon?: ReactNode
): MenuItem {
  return {
    key,
    children,
    label,
    type: "group",
    icon,
  } as MenuItem;
}
