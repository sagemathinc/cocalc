import { Menu, Dropdown, Button, Icon } from "cocalc-ui";

import { Component, React } from "../app-framework";

interface Props {
  title?: JSX.Element | string;
  onClick?: (param) => void;
  style?: React.CSSProperties;
}

export class DropdownMenu extends Component<Props> {
  render() {
    const menu = (
      <Menu
        onClick={this.props.onClick}
        style={{ maxHeight: "100vH", overflow: "auto" }}
      >
        {this.props.children}
      </Menu>
    );

    return (
      <Dropdown overlay={menu} key={"zoom-levels"}>
        <Button style={this.props.style}>
          {this.props.title} <Icon type="down" />
        </Button>
      </Dropdown>
    );
  }
}

const Item = Menu.Item;
export { Item as MenuItem };
