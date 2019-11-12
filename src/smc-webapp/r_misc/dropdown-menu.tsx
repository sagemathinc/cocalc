import { Menu, Dropdown, Button, Icon } from "cocalc-ui";
import { merge } from "smc-util/misc2";
import { Component, React } from "../app-framework";

interface Props {
  title?: JSX.Element | string;
  id?: string;
  onClick?: (key: string) => void;
  style?: React.CSSProperties;
  disabled?: boolean;
  button?: boolean;
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
          {this.props.title} <Icon type="down" />
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
                cursor: "not-allowed"
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
        style={{ maxHeight: "100vH", overflow: "auto" }}
      >
        {this.props.children}
      </Menu>
    );
    return (
      <Dropdown
        overlay={menu}
        trigger={!this.props.button ? ["click"] : undefined}
      >
        {body}
      </Dropdown>
    );
  }
}

interface MenuItemProps {
  key?: string | number;
  disabled?: boolean;
  onClick?: Function;
  onSelect?: Function;
}

// Wrapping and putting in fake onItemHover is to get
// around this bug that the antd devs are confused about:
// https://github.com/react-component/menu/issues/142

export class MenuItem extends Component<MenuItemProps, {}> {
  render() {
    const M: any = Menu.Item;
    return (
      <M
        key={this.props.key}
        disabled={this.props.disabled}
        onItemHover={() => {}}
        className={"ant-dropdown-menu-item"}
        onClick={this.props.onClick}
      >
        {this.props.children}
      </M>
    );
  }
}

export class MenuDivider extends Component<> {
  render() {
    return (
      <MenuItem>
        <hr style={{ margin: 0 }} />
      </MenuItem>
    );
  }
}
