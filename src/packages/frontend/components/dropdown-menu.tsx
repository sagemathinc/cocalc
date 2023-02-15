/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { DownOutlined } from "@ant-design/icons";
import { Button, Dropdown, Menu } from "antd";
import type { MenuProps } from "antd";

import { CSS, React } from "@cocalc/frontend/app-framework";
import { IS_TOUCH } from "../feature";

// overlay={menu} is deprecated. Instead, use MenuItems as items={...}.
export type MenuItems = NonNullable<MenuProps["items"]>;

/**
 * NOTE: to work with this, make sure your list is typed as MenuItems. Then:
 *
 *  const v: MenuItems = [
 *    { key: "a", label: "A", onClick: () => { action(key); } },
 *    ...
 *    { type: "divider" },  // for a divider
 *    ...
 * ]
 */

interface Props {
  button?: boolean; // show menu as a *Button* (disabled on touch devices -- https://github.com/sagemathinc/cocalc/issues/5113)
  disabled?: boolean;
  hide_down?: boolean;
  id?: string;
  items: MenuItems;
  maxHeight?: string;
  style?: CSS;
  title?: JSX.Element | string;
}

const STYLE = { margin: "6px 10px", cursor: "pointer" } as CSS;

export const DropdownMenu: React.FC<Props> = (props: Props) => {
  const { button, disabled, hide_down, id, items, maxHeight, style, title } =
    props;

  function render_title() {
    if (title !== "") {
      return (
        <>
          {title} {!hide_down && <DownOutlined />}
        </>
      );
    } else {
      // emtpy string implies to only show the downward caret sign
      return <DownOutlined />;
    }
  }

  function render_body() {
    if (button && !IS_TOUCH) {
      return (
        <Button style={style} disabled={disabled} id={id}>
          {render_title()}
        </Button>
      );
    } else {
      if (disabled) {
        return (
          <span
            id={id}
            style={{
              ...{
                color: "#777",
                cursor: "not-allowed",
              },
              ...STYLE,
            }}
          >
            <span style={style}>{title}</span>
          </span>
        );
      } else {
        return (
          <span style={{ ...STYLE, ...style }} id={id}>
            {title}
          </span>
        );
      }
    }
  }

  const body = render_body();

  if (disabled) {
    return body;
  }

  const menuStyle: CSS = {
    maxHeight: maxHeight ? maxHeight : "70vH",
    overflow: "auto",
  } as const;

  // items is the way to go, i.e. instead of instantiating many react elements, Antd wants a list of dicts.
  return (
    <Dropdown
      trigger={["click"]}
      placement={"bottomLeft"}
      menu={{ items, style: menuStyle }}
      disabled={disabled}
    >
      {body}
    </Dropdown>
  );
};

export function MenuItem(props) {
  const M: any = Menu.Item;
  return <M {...props}>{props.children}</M>;
}

export const MenuDivider = { type: "divider" } as const;
