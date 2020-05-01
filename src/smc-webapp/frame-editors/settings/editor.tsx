/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Settings and configuration for editing this file.
*/

import { Map } from "immutable";

import { React, Rendered, Component } from "../../app-framework";

import { is_different } from "smc-util/misc2";

// import from icon only necessary for testing via Jest
// Change to import from r_misc when it's all typescript
import { Icon } from "../../r_misc/icon";
import { Loading } from "../../r_misc/loading";

import { SpellCheck } from "./spell-check";

import { AvailableFeatures } from "../../project_configuration";

interface Props {
  id: string;
  actions: any;
  settings: Map<string, any>;
  available_features?: AvailableFeatures;
}

export class Settings extends Component<Props, {}> {
  shouldComponentUpdate(props): boolean {
    return is_different(this.props, props, ["settings", "available_features"]);
  }

  render_settings(): Rendered[] {
    const af = this.props.available_features;
    if (af == null) {
      return [<Loading key={"loading"} />];
    }
    const v: Rendered[] = [];
    this.props.settings.forEach((value, key) => {
      switch (key) {
        case "spell":
          v.push(
            <SpellCheck
              key={key}
              value={value}
              available={af.get("spellcheck")}
              set={(value) => this.props.actions.set_settings({ [key]: value })}
            />
          );
          return;
        default:
          console.warn(`UNKNOWN setting ${key} -- ignoring`);
        // we could delete it like so -- this.props.actions.set_settings({[key]:null});
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
          fontSize: "10pt",
        }}
      >
        <h3
          style={{
            borderBottom: "1px solid #ccc",
            paddingBottom: "15px",
          }}
        >
          <Icon name="wrench" /> Editor Settings
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
  component: Settings,
  hide_public: true,
};
