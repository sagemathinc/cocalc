import { MENUS } from "./menus";
import type { ReactNode } from "react";

interface MenuSpec {
  label: string;
  pos: number;
  groups: string[];
}

export interface Menus {
  [name: string]: MenuSpec;
}

export type Group = (typeof MENUS)[keyof typeof MENUS]["groups"][number];

export type OnClick = (opts: {
  props?;
  event?;
  setShowAI?: (boolean) => void;
  editorSettings?;
}) => void;

interface Options {
  props?;
  helpSearch?;
  setHelpSearch?;
  renderMenus?;
  frameTypeCommands?;
  readOnly?;
}

export interface Command {
  // group -- inside of a menu
  group: Group;
  name?: string; //not used
  // position, for sorting
  pos?: number;
  title?: ReactNode;
  icon?: ReactNode | ((opts: Options) => ReactNode);
  button?: ReactNode | ((opts: Options) => ReactNode);
  //color?: string | ((opts: Options) => string);
  label?: ReactNode | ((opts: Options) => ReactNode);
  // If onClick is NOT set, then editor_actions[name] must be defined
  // and be a function that takes the frame id as input.
  onClick?: OnClick;
  // isVisible: if a function, determine visibility based on that.
  //            if a string, use editor spec for given frame.
  isVisible?: string | (({ props }) => boolean);
  disable?: string;
  keyboard?: ReactNode;
  children?: Partial<Command>[] | ((opts: Options) => Partial<Command>[]);
  disabled?: (opts: Options) => boolean;
  // not used yet
  tour?: string;
  confirm?: {
    // popconfirm first
    title?: ReactNode;
    description?: ReactNode;
    okText?: string;
    cancelText?: string;
  };
  alwaysShow?: boolean;
  stayOpenOnClick?: boolean;
  search?: string;
}
