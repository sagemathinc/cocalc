/*
Stdout rendering.
*/

import { React, Component, Rendered } from "smc-webapp/app-framework";
import { Map } from "immutable";
import { is_ansi, Ansi } from "./ansi";
import { STDOUT_STYLE } from "./style";

interface StdoutProps {
  message: Map<string, any>;
}

export class Stdout extends Component<StdoutProps> {
  shouldComponentUpdate(nextProps: StdoutProps): boolean {
    return !this.props.message.equals(nextProps.message);
  }

  render(): Rendered {
    const value = this.props.message.get("text");
    if (is_ansi(value)) {
      return (
        <div style={STDOUT_STYLE}>
          <Ansi>{value}</Ansi>
        </div>
      );
    }
    // This span below is solely to workaround an **ancient** Firefox bug
    // See https://github.com/sagemathinc/cocalc/issues/1958
    return (
      <div style={STDOUT_STYLE}>
        <span>{value}</span>
      </div>
    );
  }
}
