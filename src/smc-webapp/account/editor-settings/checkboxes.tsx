/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Map } from "immutable";
import { Rendered, Component, React } from "../../app-framework";
import { capitalize, is_different, keys } from "smc-util/misc";
import { JUPYTER_CLASSIC_MODERN } from "smc-util/theme";
import { Checkbox } from "../../antd-bootstrap";

const EDITOR_SETTINGS_CHECKBOXES: { [setting: string]: string | Rendered } = {
  line_wrapping: "wrap long lines",
  line_numbers: "show line numbers",
  code_folding: "fold code using control+Q",
  smart_indent: "context sensitive indentation",
  electric_chars: "sometimes reindent current line",
  match_brackets: "highlight matching brackets near cursor",
  auto_close_brackets: "automatically close brackets",
  match_xml_tags: "automatically match XML tags",
  auto_close_xml_tags: "automatically close XML tags",
  auto_close_latex: "automatically close LaTeX environments",
  strip_trailing_whitespace: "remove whenever file is saved",
  show_trailing_whitespace: "show spaces at ends of lines",
  spaces_instead_of_tabs: "send spaces when the tab key is pressed",
  extra_button_bar: "more editing functions (mainly in Sage worksheets)",
  build_on_save: "build LaTex file whenever it is saved to disk",
  show_exec_warning: "warn that certain files are not directly executable",
  ask_jupyter_kernel: "ask which kernel to use for a new Jupyter Notebook",
  jupyter_classic: (
    <span>
      use classical Jupyter notebook{" "}
      <a href={JUPYTER_CLASSIC_MODERN} target="_blank">
        (DANGER: this can cause trouble...)
      </a>
    </span>
  ),
  /* commented out since we are never using this.
  disable_jupyter_windowing:
    "never use windowing with Jupyter notebooks (windowing is sometimes used on the Chrome browser to make very large notebooks render quickly, but can lead to trouble)",*/
};

interface Props {
  editor_settings: Map<string, any>;
  email_address?: string;
  on_change: Function;
}

export class EditorSettingsCheckboxes extends Component<Props> {
  public shouldComponentUpdate(props): boolean {
    return is_different(this.props, props, [
      "editor_settings",
      "email_address",
    ]);
  }

  private label_checkbox(name: string, desc: string | Rendered): Rendered {
    return (
      <span>
        {capitalize(
          name
            .replace(/_/g, " ")
            .replace(/-/g, " ")
            .replace("xml", "XML")
            .replace("latex", "LaTeX")
        ) + ": "}
        {desc}
      </span>
    );
  }

  private render_checkbox(name: string, desc: string | Rendered): Rendered {
    if (
      this.props.email_address?.indexOf("minervaproject.com") != -1 &&
      name === "jupyter_classic"
    ) {
      // Special case -- minerva doesn't get the jupyter classic option, to avoid student confusion.
      return;
    }
    return (
      <Checkbox
        checked={!!this.props.editor_settings.get(name)}
        key={name}
        onChange={(e) => this.props.on_change(name, e.target.checked)}
      >
        {this.label_checkbox(name, desc)}
      </Checkbox>
    );
  }

  public render(): JSX.Element {
    return (
      <span>
        {keys(EDITOR_SETTINGS_CHECKBOXES).map((name) =>
          this.render_checkbox(name, EDITOR_SETTINGS_CHECKBOXES[name])
        )}
      </span>
    );
  }
}
