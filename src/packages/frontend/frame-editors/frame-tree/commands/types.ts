/*
 *  This file is part of CoCalc: Copyright © 2024 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import type { ReactNode } from "react";

import { IconName, IconRotation } from "@cocalc/frontend/components/icon";
import { IntlMessage } from "@cocalc/frontend/i18n";
import type { ManageCommands } from "./manage";
import { MENUS } from "./menus";

interface MenuSpec {
  label: IntlMessage | string;
  pos: number;
  groups: string[];
}

export interface Menus {
  [name: string]: MenuSpec;
}

export type Group = (typeof MENUS)[keyof typeof MENUS]["groups"][number];

export type OnClick = (opts: ManageCommands & { event? }) => void;

interface PopconfirmOpts {
  title?: string | IntlMessage | React.JSX.Element;
  description?: string | IntlMessage | React.JSX.Element;
  okText?: string | IntlMessage;
  cancelText?: string | IntlMessage;
}

export interface Command {
  // group -- inside of a menu
  group: Group;
  name?: string; //not used
  // position, for sorting
  pos?: number;
  title?: ReactNode | ((opts: ManageCommands) => ReactNode) | IntlMessage;
  icon?: IconName | ReactNode | ((opts: ManageCommands) => ReactNode);
  iconRotate?: IconRotation;
  button?: ReactNode | ((opts: ManageCommands) => ReactNode) | IntlMessage;
  //color?: string | ((opts: ManageCommands) => string);
  label?: ReactNode | ((opts: ManageCommands) => ReactNode) | IntlMessage;
  // If onClick is NOT set, then editor_actions[name] must be defined
  // and be a function that takes the frame id as input.
  onClick?: OnClick;
  // isVisible: if a function, determine visibility based on that.
  //            if a string, use editor spec for given frame.
  isVisible?: string | (({ props }) => boolean);
  disable?: string;
  keyboard?: ReactNode;
  children?:
    | Partial<Command>[]
    | ((opts: ManageCommands) => Partial<Command>[]);
  disabled?: (opts: ManageCommands) => boolean;
  // not used yet
  tour?: string;
  // do modal popconfirm first -- takes options to antd
  // Popconfirm, or a function that returns Popconfirm options.
  // See frontend/app/popconfirm-modal.tsx for subtleties.
  popconfirm?:
    | PopconfirmOpts
    | ((opts: ManageCommands) => PopconfirmOpts | undefined);
  // if true, never show this on mobile
  neverVisibleOnMobile?: boolean;
  // if true, always show this (unless neverVisibleOnMobile set, obviously).
  alwaysShow?: boolean;
  stayOpenOnClick?: boolean;
  search?: string;
}
