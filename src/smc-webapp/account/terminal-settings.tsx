import { Map } from "immutable";

import { Component, React, Rendered } from "../app-framework";
import { set_account_table } from "./util";
import { Icon, LabeledRow, SelectorInput, Loading } from "../r_misc";
import { Panel } from "../antd-bootstrap";

const TERMINAL_COLOR_SCHEMES: { [name: string]: string } = {};

// This global Terminal object is from old xterm.js, and the color_schemes
// stuff is defined in webapp-lib/term/color_themes.js
// Of course we should do this in a better way!
for (const theme in (window as any).Terminal.color_schemes) {
  const val = (window as any).Terminal.color_schemes[theme];
  TERMINAL_COLOR_SCHEMES[theme] = val.comment;
}

const TERMINAL_FONT_FAMILIES = {
  "droid-sans-mono": "Droid Sans Mono",
  "Courier New": "Courier New",
  monospace: "Monospace",
};

interface Props {
  terminal?: Map<string, any>;
}

// WARNING: in console.coffee there is also code to set the font size,
// which our store ignores...
export class TerminalSettings extends Component<Props> {
  private handleChange(obj: any): void {
    set_account_table({ terminal: obj });
  }

  private render_color_scheme(): Rendered {
    return (
      <LabeledRow label="Terminal color scheme">
        <SelectorInput
          selected={this.props.terminal?.get("color_scheme")}
          options={TERMINAL_COLOR_SCHEMES}
          on_change={(color_scheme) => this.handleChange({ color_scheme })}
        />
      </LabeledRow>
    );
  }

  private render_font_family(): Rendered {
    return; // disabled due to https://github.com/sagemathinc/cocalc/issues/3304
    return (
      <LabeledRow label="Terminal font family">
        <SelectorInput
          selected={this.props.terminal?.get("font")}
          options={TERMINAL_FONT_FAMILIES}
          on_change={(font) => this.handleChange({ font })}
        />
      </LabeledRow>
    );
  }

  render() {
    if (this.props.terminal == null) {
      return <Loading />;
    }
    return (
      <Panel
        header={
          <>
            {" "}
            <Icon name="terminal" /> Terminal
          </>
        }
      >
        {this.render_color_scheme()}
        {this.render_font_family()}
      </Panel>
    );
  }
}
