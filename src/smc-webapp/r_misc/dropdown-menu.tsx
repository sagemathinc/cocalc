import { Component, React } from "../app-framework";
import { Dummy } from "./dummy";

// This ugly hack is needed because of a problem when rendering static pages (and probably also starting share server)
let Dropdown: any;
let Menu: any;
let Button: any;
let Icon: any;
try {
  const ui = require("cocalc-ui");
  Dropdown = ui.Dropdown;
  Menu = ui.Menu;
  Button = ui.Button;
  Icon = ui.Icon;
} catch (err) {
  console.log(`couple of Antd components cannot be imported -- ${err}`);
  Dropdown = Menu = Button = Icon = Dummy;
}

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
