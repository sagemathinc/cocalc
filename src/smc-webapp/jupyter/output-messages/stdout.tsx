/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Stdout rendering.
*/

import { React } from "smc-webapp/app-framework";
import { Map } from "immutable";
import { is_ansi, Ansi } from "./ansi";
import { STDOUT_STYLE } from "./style";

interface StdoutProps {
  message: Map<string, any>;
}

export const Stdout: React.FC<StdoutProps> = ({ message }) => {
  let value = message.get("text");
  if (typeof value != "string") {
    value = `${value}`;
  }
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
};
