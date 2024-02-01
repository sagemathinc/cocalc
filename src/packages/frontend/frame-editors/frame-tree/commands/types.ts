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

export type OnClick = ({
  props,
  event,
  setShowAI,
}: {
  props?;
  event?;
  setShowAI?: (boolean) => void;
}) => void;

export interface Command {
  // group -- inside of a menu
  group: Group;
  // position, for sorting
  pos?: number;
  title?: ReactNode;
  icon?: ReactNode | ((opts: { props? }) => ReactNode);
  label?:
    | ReactNode
    | ((opts: {
        props?;
        helpSearch?;
        setHelpSearch?;
        renderMenus?;
      }) => ReactNode);
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
    | ((opts: { props?; frameTypeCommands? }) => Partial<Command>[]);
  disabled?: ({ props, readOnly }) => boolean;
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
