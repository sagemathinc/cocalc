/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { FormattedMessage } from "react-intl";
import { redux, useTypedRedux } from "@cocalc/frontend/app-framework";
import { Panel } from "@cocalc/frontend/antd-bootstrap";
import { Icon, Loading } from "@cocalc/frontend/components";
import { EDITOR_ICON_NAME } from "../account-preferences-editor";
import { KEYBOARD_VARIANTS } from "@cocalc/frontend/frame-editors/x11-editor/xpra/keyboards";
import { deep_copy } from "@cocalc/util/misc";
import { EditorSettingsAutosaveInterval } from "./autosave-interval";
import { EditorSettingsCheckboxes } from "./checkboxes";
import { EditorSettingsColorScheme } from "./color-schemes";
import { EditorSettingsFontSize } from "./font-size";
import { EditorSettingsIndentSize } from "./indent-size";
import { EditorSettingsKeyboardBindings } from "./keyboard-bindings";
import {
  EditorSettingsKeyboardVariant,
  EditorSettingsPhysicalKeyboard,
} from "./x11-keyboard";
import { set_account_table } from "../util";

export function EditorSettings({}) {
  const autosave = useTypedRedux("account", "autosave");
  const font_size = useTypedRedux("account", "font_size");
  const editor_settings = useTypedRedux("account", "editor_settings");
  const email_address = useTypedRedux("account", "email_address");
  const tab_size = editor_settings?.get("tab_size");

  function get_keyboard_variant_options(val?) {
    if (val == null) {
      val = editor_settings?.get("physical_keyboard");
    }
    const options = deep_copy(KEYBOARD_VARIANTS[val] ?? []);
    options.unshift({ value: "", display: "No variant" });
    return options;
  }

  function on_change(name: string, val: any): void {
    if (name === "autosave" || name === "font_size") {
      set_account_table({ [name]: val });
    } else {
      set_account_table({ editor_settings: { [name]: val } });
    }

    if (name === "physical_keyboard") {
      const options = get_keyboard_variant_options(val);
      redux
        .getActions("account")
        .setState({ keyboard_variant_options: options });
      for (const opt of options) {
        if (opt.value === "nodeadkeys") {
          on_change("keyboard_variant", opt.value);
          return;
        }
      }
      // otherwise, select default
      on_change("keyboard_variant", "");
    }
  }

  if (editor_settings == null || font_size == null || !autosave || !tab_size) {
    return <Loading />;
  }

  return (
    <Panel
      header={
        <>
          <Icon name={EDITOR_ICON_NAME} />{" "}
          <FormattedMessage
            id="account.editor-settings.title"
            defaultMessage="Editor Settings"
          />
        </>
      }
    >
      <EditorSettingsFontSize on_change={on_change} font_size={font_size} />
      <EditorSettingsAutosaveInterval
        on_change={on_change}
        autosave={autosave}
      />
      <EditorSettingsIndentSize on_change={on_change} tab_size={tab_size} />
      <EditorSettingsColorScheme
        on_change={(value) => on_change("theme", value)}
        theme={editor_settings.get("theme") ?? ""}
        editor_settings={editor_settings}
        font_size={font_size}
      />
      <EditorSettingsKeyboardBindings
        on_change={(value) => on_change("bindings", value)}
        bindings={editor_settings.get("bindings") ?? ""}
      />
      <EditorSettingsPhysicalKeyboard
        on_change={(value) => on_change("physical_keyboard", value)}
        physical_keyboard={editor_settings.get("physical_keyboard") ?? ""}
      />
      <EditorSettingsKeyboardVariant
        on_change={(value) => on_change("keyboard_variant", value)}
        keyboard_variant={editor_settings.get("keyboard_variant") ?? ""}
        keyboard_variant_options={get_keyboard_variant_options()}
      />
      <EditorSettingsCheckboxes
        on_change={on_change}
        editor_settings={editor_settings}
        email_address={email_address}
      />
    </Panel>
  );
}
