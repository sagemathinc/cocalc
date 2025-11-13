/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Settings and configuration for editing this file.
*/

import { Map } from "immutable";

import { Component, Rendered } from "@cocalc/frontend/app-framework";
import { is_different } from "@cocalc/util/misc";
import { EditorDescription } from "../frame-tree/types";
// import from icon only necessary for testing via Jest
// Change to import from components when it's all typescript
import { Paragraph, Title } from "@cocalc/frontend/components";
import { Icon } from "@cocalc/frontend/components/icon";
import { Loading } from "@cocalc/frontend/components/loading";
import { editor, labels } from "@cocalc/frontend/i18n";
import { AvailableFeatures } from "@cocalc/frontend/project_configuration";
import { SpellCheck } from "./spell-check";

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
            />,
          );
          return;
        default:
          console.warn(`UNKNOWN setting ${key} -- ignoring`);
        // we could delete it like so -- this.props.actions.set_settings({[key]:null});
      }
    });

    if (v.length == 0) {
      v.push(
        <Paragraph>
          This editor currently has no configurable settings.
        </Paragraph>,
      );
    }
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
        <Title
          level={3}
          style={{
            borderBottom: "1px solid #ccc",
            paddingBottom: "15px",
          }}
        >
          <Icon name="wrench" /> Editor Settings
        </Title>
        {this.render_settings()}
      </div>
    );
  }
}

export const SETTINGS_SPEC: EditorDescription = {
  type: "settings",
  short: labels.settings,
  name: editor.editor_settings,
  icon: "wrench",
  commands: {},
  component: Settings as any, // TODO: Component incompatible with type, rewrite to React.FC
  hide_public: true,
} as const;
