/*
Settings and configuration for editing this file.
*/

import { Map } from "immutable";

//import { ButtonGroup, Button } from "react-bootstrap";
import { React, Rendered, Component } from "../generic/react";

import { is_different } from "../generic/misc";

const { Icon } = require("smc-webapp/r_misc");

interface Props {
  id: string;
  actions: any;
  settings: Map<string, any>;
}

export class Settings extends Component<Props, {}> {
  shouldComponentUpdate(props): boolean {
    return is_different(this.props, props, ["settings"]);
  }

  render(): Rendered {
    return (
      <div
        className={"smc-vfill"}
        style={{
          overflowY: "scroll",
          padding: "5px 15px",
          fontSize: "10pt"
        }}
      >
        <h3>
          <Icon name="wrench" /> Settings
        </h3>
      </div>
    );
  }
}
