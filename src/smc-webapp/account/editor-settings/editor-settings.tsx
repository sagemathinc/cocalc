/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Map } from "immutable";
import { deep_copy } from "smc-util/misc2";
import { redux, Component, React } from "../../app-framework";
import { Panel } from "../../antd-bootstrap";
import { Icon, Loading } from "../../r_misc";

import { EditorSettingsCheckboxes } from "./checkboxes";
import { EditorSettingsAutosaveInterval } from "./autosave-interval";
import { EditorSettingsColorScheme } from "./color-schemes";
import { EditorSettingsFontSize } from "./font-size";
import { EditorSettingsIndentSize } from "./indent-size";
import { EditorSettingsKeyboardBindings } from "./keyboard-bindings";
import { KEYBOARD_VARIANTS } from "../../frame-editors/x11-editor/xpra/keyboards";
import {
  EditorSettingsPhysicalKeyboard,
  EditorSettingsKeyboardVariant,
} from "./x11-keyboard";

import { set_account_table } from "../util";

interface Props {
  autosave?: number;
  tab_size?: number;
  font_size?: number;
  email_address?: string;
  editor_settings?: Map<string, any>;
}

export class EditorSettings extends Component<Props> {
  private get_keyboard_variant_options(val?) {
    if (val == null) {
      val = this.props.editor_settings?.get("physical_keyboard");
    }
    const options = deep_copy(KEYBOARD_VARIANTS[val] ?? []);
    options.unshift({ value: "", display: "No variant" });
    return options;
  }

  private on_change(name: string, val: any): void {
    if (name === "autosave" || name === "font_size") {
      set_account_table({ [name]: val });
    } else {
      set_account_table({ editor_settings: { [name]: val } });
    }

    if (name === "physical_keyboard") {
      const options = this.get_keyboard_variant_options(val);
      redux
        .getActions("account")
        .setState({ keyboard_variant_options: options });
      for (const opt of options) {
        if (opt.value === "nodeadkeys") {
          this.on_change("keyboard_variant", opt.value);
          return;
        }
      }
      // otherwise, select default
      this.on_change("keyboard_variant", "");
    }
  }

  public render() {
    if (
      this.props.editor_settings == null ||
      this.props.font_size == null ||
      !this.props.autosave ||
      !this.props.tab_size
    ) {
      return <Loading />;
    }
    return (
      <Panel
        header={
          <>
            <Icon name="edit" /> Editor
          </>
        }
      >
        <EditorSettingsFontSize
          on_change={this.on_change.bind(this)}
          font_size={this.props.font_size}
        />
        <EditorSettingsAutosaveInterval
          on_change={this.on_change.bind(this)}
          autosave={this.props.autosave}
        />
        <EditorSettingsIndentSize
          on_change={this.on_change.bind(this)}
          tab_size={this.props.tab_size}
        />
        <EditorSettingsColorScheme
          on_change={(value) => this.on_change("theme", value)}
          theme={this.props.editor_settings.get("theme")}
          editor_settings={this.props.editor_settings}
          font_size={this.props.font_size}
        />
        <EditorSettingsKeyboardBindings
          on_change={(value) => this.on_change("bindings", value)}
          bindings={this.props.editor_settings.get("bindings")}
        />
        <EditorSettingsPhysicalKeyboard
          on_change={(value) => this.on_change("physical_keyboard", value)}
          physical_keyboard={this.props.editor_settings.get(
            "physical_keyboard"
          )}
        />
        <EditorSettingsKeyboardVariant
          on_change={(value) => this.on_change("keyboard_variant", value)}
          keyboard_variant={this.props.editor_settings.get("keyboard_variant")}
          keyboard_variant_options={this.get_keyboard_variant_options()}
        />
        <EditorSettingsCheckboxes
          on_change={this.on_change.bind(this)}
          editor_settings={this.props.editor_settings}
          email_address={this.props.email_address}
        />
      </Panel>
    );
  }
}
