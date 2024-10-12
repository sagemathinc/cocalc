/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Stdout rendering.
*/

import React from "react";
import { Map } from "immutable";
import { is_ansi, Ansi } from "./ansi";
import { STDOUT_STYLE } from "./style";

interface StdoutProps {
  message: Map<string, any>;
}

export const Stdout: React.FC<StdoutProps> = ({ message }: StdoutProps) => {
  let value = message.get("text");
  if (typeof value != "string") {
    value = `${value}`;
  }
  if (is_ansi(value)) {
    // NOTE: even if is_ansi returns true, it might not still be valid ansi,
    // and the ansi renderer *CAN* crash when fed strings it doesn't like.
    // A user reported a crash when doing some encryption work and printing
    // crazy mangled XOR'd strings to the output.  This also crashes JupyterLab.
    // Here we catch that crash using an error boundary and fallback to the
    // usual rendering.
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
};
