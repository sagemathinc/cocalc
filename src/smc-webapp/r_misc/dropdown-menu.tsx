/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Menu, Dropdown, Button } from "antd";
import { DownOutlined } from "@ant-design/icons";
import { merge } from "smc-util/misc2";
import { Component, React } from "../app-framework";

interface Props {
  title?: JSX.Element | string;
  id?: string;
  onClick?: (key: string) => void;
  style?: React.CSSProperties;
  disabled?: boolean;
  button?: boolean;
  maxHeight?: string;
}

export class DropdownMenu extends Component<Props> {
  on_click(e): void {
    if (this.props.onClick !== undefined) {
      this.props.onClick(e.key);
    }
  }

  render_body() {
    if (this.props.button) {
      return (
        <Button
          style={this.props.style}
          disabled={this.props.disabled}
          id={this.props.id}
        >
          {this.props.title} <DownOutlined />
        </Button>
      );
    } else {
      let style = { margin: "6px 12px", cursor: "pointer" };
      if (this.props.disabled) {
        return (
          <span
            id={this.props.id}
            style={merge(
              {
                color: "#777",
                cursor: "not-allowed",
              },
              style
            )}
          >
            <span style={this.props.style}>{this.props.title}</span>
          </span>
        );
      } else {
        if (this.props.style) {
          style = merge(style, this.props.style);
        }
        return (
          <span style={style} id={this.props.id}>
            {this.props.title}
          </span>
        );
      }
    }
  }

  render() {
    const body = this.render_body();
    if (this.props.disabled) {
      return body;
    }
    const menu = (
      <Menu
        onClick={this.on_click.bind(this)}
        style={{
          maxHeight: this.props.maxHeight ? this.props.maxHeight : "70vH",
          overflow: "auto",
        }}
      >
        {this.props.children}
      </Menu>
    );
    return (
      <Dropdown
        overlay={menu}
        trigger={!this.props.button ? ["click"] : undefined}
        placement={"bottomLeft"}
      >
        {body}
      </Dropdown>
    );
  }
}

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
