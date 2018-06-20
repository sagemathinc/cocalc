/*
Settings and configuration for editing this file.
*/

import { Map } from "immutable";

import { React, Rendered, Component } from "../generic/react";

import { is_different } from "../generic/misc";

const { Icon } = require("smc-webapp/r_misc");

import { SpellCheck } from "./spell-check";

interface Props {
  id: string;
  actions: any;
  settings: Map<string, any>;
}

export class Settings extends Component<Props, {}> {
  shouldComponentUpdate(props): boolean {
    return is_different(this.props, props, ["settings"]);
  }

  render_settings(): Rendered[] {
    const v: Rendered[] = [];
    this.props.settings.forEach((value, key) => {
      switch (key) {
        case "spell":
          v.push(
            <SpellCheck
              key={key}
              value={value}
              set={value => this.props.actions.set_setting(key, value)}
            />
          );
          return;
        default:
          console.warn(`UNKNOWN setting ${key}`);
      }
    });
    return v;
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
        {this.render_settings()}
      </div>
    );
  }
}

export const SETTINGS_SPEC = {
  short: "Settings",
  name: "Editor Settings",
  icon: "wrench",
  buttons: {},
  component: Settings
};
