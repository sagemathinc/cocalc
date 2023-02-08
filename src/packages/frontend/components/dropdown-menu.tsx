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
export type MenuItems = MenuProps["items"];

interface Props {
  title?: JSX.Element | string;
  id?: string;
  onClick?: (key: string) => void; // remove as well, when everything is switched over to "items"
  style?: CSS;
  disabled?: boolean;
  button?: boolean; // show menu as a *Button* (disabled on touch devices -- https://github.com/sagemathinc/cocalc/issues/5113)
  hide_down?: boolean;
  maxHeight?: string;
  children?: React.ReactNode;
  items?: MenuItems;
}

const STYLE = { margin: "6px 10px", cursor: "pointer" } as CSS;

export const DropdownMenu: React.FC<Props> = (props: Props) => {
  const {
    title,
    id,
    onClick,
    style,
    disabled,
    button,
    hide_down,
    maxHeight,
    items,
    children,
  } = props;

  function on_click(e): void {
    if (onClick !== undefined) {
      onClick(e.key);
    }
  }

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

  if (items != null) {
    return (
      <Dropdown
        trigger={["click"]}
        placement={"bottomLeft"}
        menu={{ items, style: menuStyle }}
      >
        {body}
      </Dropdown>
    );
  } else {
    // THIS IS DEPRECATED -- use items={...} instead.
    const menu = (
      <Menu onClick={on_click.bind(this)} style={menuStyle}>
        {children}
      </Menu>
    );

    return (
      <Dropdown overlay={menu} trigger={["click"]} placement={"bottomLeft"}>
        {body}
      </Dropdown>
    );
  }
};

export function MenuItem(props) {
  const M: any = Menu.Item;
  return <M {...props}>{props.children}</M>;
}

export const MenuDivider = Menu.Divider;
