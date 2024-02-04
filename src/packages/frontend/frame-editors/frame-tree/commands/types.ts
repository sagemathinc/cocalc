import { MENUS } from "./menus";
import type { ReactNode } from "react";
import type { ManageCommands } from "./manage";

interface MenuSpec {
  label: string;
  pos: number;
  groups: string[];
}

export interface Menus {
  [name: string]: MenuSpec;
}

export type Group = (typeof MENUS)[keyof typeof MENUS]["groups"][number];

export type OnClick = (opts: ManageCommands & { event? }) => void;

export interface Command {
  // group -- inside of a menu
  group: Group;
  name?: string; //not used
  // position, for sorting
  pos?: number;
  title?: ReactNode;
  icon?: ReactNode | ((opts: ManageCommands) => ReactNode);
  button?: ReactNode | ((opts: ManageCommands) => ReactNode);
  //color?: string | ((opts: ManageCommands) => string);
  label?: ReactNode | ((opts: ManageCommands) => ReactNode);
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
  popconfirm?: any | ((opts: ManageCommands) => any);
  // if true, never show this on mobile
  neverVisibleOnMobile?: boolean;
  // if true, always show this (unless neverVisibleOnMobile set, obviously).
  alwaysShow?: boolean;
  stayOpenOnClick?: boolean;
  search?: string;
}
