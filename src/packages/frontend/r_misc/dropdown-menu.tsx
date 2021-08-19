/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Menu, Dropdown, Button } from "antd";
import { DownOutlined } from "@ant-design/icons";
import { CSS, React } from "../app-framework";
import { IS_TOUCH } from "../feature";

interface Props {
  title?: JSX.Element | string;
  id?: string;
  onClick?: (key: string) => void;
  style?: CSS;
  disabled?: boolean;
  button?: boolean; // show menu as a *Button* (disabled on touch devices -- https://github.com/sagemathinc/cocalc/issues/5113)
  hide_down?: boolean;
  maxHeight?: string;
  children: React.ReactNode;
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

  const menu = (
    <Menu
      onClick={on_click.bind(this)}
      style={{
        maxHeight: maxHeight ? maxHeight : "70vH",
        overflow: "auto",
      }}
    >
      {children}
    </Menu>
  );

  return (
    <Dropdown
      overlay={menu}
      trigger={!button ? ["click"] : undefined}
      placement={"bottomLeft"}
    >
      {body}
    </Dropdown>
  );
};

// NOTE: we wrap and put in a fake onItemHover to work around this bug:
//     https://github.com/react-component/menu/issues/142
export function MenuItem(props) {
  const M: any = Menu.Item;
  return (
    <M
      {...props}
      onItemHover={props.onItemHover != null ? props.onItemHover : () => {}}
    >
      {props.children}
    </M>
  );
}

export const MenuDivider = Menu.Divider;
