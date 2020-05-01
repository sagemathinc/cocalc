/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React, Component, Rendered } from "smc-webapp/app-framework";
import { Map } from "immutable";
import { is_ansi, Ansi } from "./ansi";
import { STDERR_STYLE } from "./style";

interface StderrProps {
  message: Map<string, any>;
}

export class Stderr extends Component<StderrProps> {
  shouldComponentUpdate(nextProps: StderrProps): boolean {
    return !this.props.message.equals(nextProps.message);
  }

  render(): Rendered {
    let value = this.props.message.get("text");
    if (typeof value != "string") {
      value = `${value}`;
    }
    if (is_ansi(value)) {
      return (
        <div style={STDERR_STYLE}>
          <Ansi>{value}</Ansi>
        </div>
      );
    }
    // span -- see https://github.com/sagemathinc/cocalc/issues/1958
    return (
      <div style={STDERR_STYLE}>
        <span>{value}</span>
      </div>
    );
  }
}
