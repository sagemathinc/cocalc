/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { defineMessage, useIntl } from "react-intl";
import { Checkbox } from "@cocalc/frontend/antd-bootstrap";
import { Rendered } from "@cocalc/frontend/app-framework";
import { IntlMessage, isIntlMessage } from "@cocalc/frontend/i18n";
import { capitalize, keys } from "@cocalc/util/misc";

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
    defaultMessage: "sometimes reindent current line",
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
      "render entire Jupyter Notebook instead of just visible part (slower but more reliable)",
  }),
} as const;

interface Props {
  editor_settings;
  email_address?: string;
  on_change: Function;
}

export function EditorSettingsCheckboxes(props: Props) {
  const intl = useIntl();

  function label_checkbox(
    name: string,
    desc: IntlMessage | Rendered,
  ): Rendered {
    return (
      <span>
        {capitalize(
          name
            .replace(/_/g, " ")
            .replace(/-/g, " ")
            .replace("xml", "XML")
            .replace("latex", "LaTeX"),
        ) + ": "}
        {isIntlMessage(desc) ? intl.formatMessage(desc) : desc}
      </span>
    );
  }

  function render_checkbox(
    name: string,
    desc: IntlMessage | Rendered,
  ): Rendered {
    if (
      props.email_address?.indexOf("minervaproject.com") != -1 &&
      name === "jupyter_classic"
    ) {
      // Special case -- minerva doesn't get the jupyter classic option, to avoid student confusion.
      return;
    }
    return (
      <Checkbox
        checked={!!props.editor_settings.get(name)}
        key={name}
        onChange={(e) => props.on_change(name, e.target.checked)}
      >
        {label_checkbox(name, desc)}
      </Checkbox>
    );
  }

  return (
    <span>
      {keys(EDITOR_SETTINGS_CHECKBOXES).map((name) =>
        render_checkbox(name, EDITOR_SETTINGS_CHECKBOXES[name]),
      )}
    </span>
  );
}
