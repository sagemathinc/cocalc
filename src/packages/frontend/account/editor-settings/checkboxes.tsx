/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// cSpell:ignore codebar

import { Panel, Switch } from "@cocalc/frontend/antd-bootstrap";
import { Rendered } from "@cocalc/frontend/app-framework";
import { Icon, IconName } from "@cocalc/frontend/components";
import { IntlMessage, isIntlMessage } from "@cocalc/frontend/i18n";
import { capitalize } from "@cocalc/util/misc";
import { defineMessage, useIntl } from "react-intl";

const EDITOR_SETTINGS_CHECKBOXES = {
  extra_button_bar: defineMessage({
    id: "account.editor-setting.checkbox.extra_button_bar",
    defaultMessage:
      "customizable button bar below menu bar with shortcuts to menu items",
  }),
  line_wrapping: defineMessage({
    id: "account.editor-setting.checkbox.line_wrapping",
    defaultMessage: "wrap long lines",
  }),
  line_numbers: defineMessage({
    id: "account.editor-setting.checkbox.line_numbers",
    defaultMessage: "show line numbers",
  }),
  jupyter_line_numbers: defineMessage({
    id: "account.editor-setting.checkbox.jupyter_line_numbers",
    defaultMessage: "show line numbers in Jupyter Notebooks",
  }),
  code_folding: defineMessage({
    id: "account.editor-setting.checkbox.code_folding",
    defaultMessage: "fold code using control+Q",
  }),
  smart_indent: defineMessage({
    id: "account.editor-setting.checkbox.smart_indent",
    defaultMessage: "context sensitive indentation",
  }),
  electric_chars: defineMessage({
    id: "account.editor-setting.checkbox.electric_chars",
    defaultMessage: "sometimes re-indent current line",
  }),
  match_brackets: defineMessage({
    id: "account.editor-setting.checkbox.match_brackets",
    defaultMessage: "highlight matching brackets near cursor",
  }),
  auto_close_brackets: defineMessage({
    id: "account.editor-setting.checkbox.auto_close_brackets",
    defaultMessage: "automatically close brackets",
  }),
  match_xml_tags: defineMessage({
    id: "account.editor-setting.checkbox.match_xml_tags",
    defaultMessage: "automatically match XML tags",
  }),
  auto_close_xml_tags: defineMessage({
    id: "account.editor-setting.checkbox.auto_close_xml_tags",
    defaultMessage: "automatically close XML tags",
  }),
  auto_close_latex: defineMessage({
    id: "account.editor-setting.checkbox.auto_close_latex",
    defaultMessage: "automatically close LaTeX environments",
  }),
  strip_trailing_whitespace: defineMessage({
    id: "account.editor-setting.checkbox.strip_trailing_whitespace",
    defaultMessage: "remove whenever file is saved",
  }),
  show_trailing_whitespace: defineMessage({
    id: "account.editor-setting.checkbox.show_trailing_whitespace",
    defaultMessage: "show spaces at ends of lines",
  }),
  spaces_instead_of_tabs: defineMessage({
    id: "account.editor-setting.checkbox.spaces_instead_of_tabs",
    defaultMessage: "send spaces when the tab key is pressed",
  }),
  build_on_save: defineMessage({
    id: "account.editor-setting.checkbox.build_on_save",
    defaultMessage: "build LaTex/Rmd files whenever it is saved to disk",
  }),
  show_exec_warning: defineMessage({
    id: "account.editor-setting.checkbox.show_exec_warning",
    defaultMessage: "warn that certain files are not directly executable",
  }),
  ask_jupyter_kernel: defineMessage({
    id: "account.editor-setting.checkbox.ask_jupyter_kernel",
    defaultMessage: "ask which kernel to use for a new Jupyter Notebook",
  }),
  show_my_other_cursors: "when editing the same file in multiple browsers",
  disable_jupyter_virtualization: defineMessage({
    id: "account.editor-setting.checkbox.disable_jupyter_virtualization",
    defaultMessage:
      "render entire Jupyter Notebook instead of just visible part (slower and not recommended)",
  }),
  disable_markdown_codebar: defineMessage({
    id: "account.other-settings.markdown_codebar",
    defaultMessage: `<strong>Disable the markdown code bar</strong> in all markdown documents.
      Checking this hides the extra run, copy, and explain buttons in fenced code blocks.`,
  }),
} as const;

// Type for valid checkbox keys
type CheckboxKey = keyof typeof EDITOR_SETTINGS_CHECKBOXES;

// Group checkboxes into logical panels
const DISPLAY_SETTINGS: readonly CheckboxKey[] = [
  "line_wrapping",
  "line_numbers",
  "jupyter_line_numbers",
  "show_trailing_whitespace",
  "show_my_other_cursors",
] as const;

const EDITING_BEHAVIOR: readonly CheckboxKey[] = [
  "code_folding",
  "smart_indent",
  "electric_chars",
  "spaces_instead_of_tabs",
  "strip_trailing_whitespace",
] as const;

const AUTOCOMPLETION: readonly CheckboxKey[] = [
  "match_brackets",
  "auto_close_brackets",
  "match_xml_tags",
  "auto_close_xml_tags",
  "auto_close_latex",
] as const;

const FILE_OPERATIONS: readonly CheckboxKey[] = [
  "build_on_save",
  "show_exec_warning",
] as const;

const JUPYTER_SETTINGS: readonly CheckboxKey[] = [
  "ask_jupyter_kernel",
  "disable_jupyter_virtualization",
] as const;

const UI_ELEMENTS: readonly CheckboxKey[] = [
  "extra_button_bar",
  "disable_markdown_codebar",
] as const;

interface Props {
  editor_settings;
  other_settings?;
  email_address?: string;
  on_change: Function;
  on_change_other_settings?: Function;
}

export function EditorSettingsCheckboxes(props: Props) {
  const intl = useIntl();

  function renderName(name: CheckboxKey) {
    if (name === "disable_markdown_codebar") return;
    return (
      <strong>
        {capitalize(
          name
            .replace(/_/g, " ")
            .replace(/-/g, " ")
            .replace("xml", "XML")
            .replace("latex", "LaTeX"),
        ) + ": "}
      </strong>
    );
  }

  function label_checkbox(
    name: CheckboxKey,
    desc: IntlMessage | Rendered | string,
  ): Rendered {
    return (
      <span>
        {renderName(name)}
        {isIntlMessage(desc) ? intl.formatMessage(desc) : desc}
      </span>
    );
  }

  function render_checkbox(
    name: CheckboxKey,
    desc: IntlMessage | Rendered | string,
  ): Rendered {
    // Special handling for disable_markdown_codebar which is in other_settings
    const is_other_setting = name === "disable_markdown_codebar";
    const checked = is_other_setting
      ? !!props.other_settings?.get(name)
      : !!props.editor_settings.get(name);
    const onChange = is_other_setting
      ? (e) => props.on_change_other_settings?.(name, e.target.checked)
      : (e) => props.on_change(name, e.target.checked);

    return (
      <Switch checked={checked} key={name} onChange={onChange}>
        {label_checkbox(name, desc)}
      </Switch>
    );
  }

  function renderPanel(
    header: string,
    icon: IconName,
    settingNames: readonly CheckboxKey[],
  ) {
    return (
      <Panel
        size="small"
        header={
          <>
            <Icon name={icon} /> {header}
          </>
        }
      >
        {settingNames.map((name) =>
          render_checkbox(name, EDITOR_SETTINGS_CHECKBOXES[name]),
        )}
      </Panel>
    );
  }

  return (
    <>
      {renderPanel("Display Settings", "eye", DISPLAY_SETTINGS)}
      {renderPanel("Editing Behavior", "edit", EDITING_BEHAVIOR)}
      {renderPanel("Auto-completion", "code", AUTOCOMPLETION)}
      {renderPanel("File Operations", "file", FILE_OPERATIONS)}
      {renderPanel("Jupyter Settings", "jupyter", JUPYTER_SETTINGS)}
      {renderPanel("UI Elements", "desktop", UI_ELEMENTS)}
    </>
  );
}
