/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Rendering input part of a Sage worksheet cell
*/

import * as React from "react";
import CodeMirrorStatic from "smc-webapp/codemirror/static";
import { FLAGS } from "smc-util/sagews";

const OPTIONS = { mode: { name: "sagews" } } as const;

interface Props {
  input?: string;
  flags?: string;
}

export function CellInput({ input, flags }: Props) {
  if (flags != null && flags.indexOf(FLAGS.hide_input) != -1) {
    return <span />;
  } else {
    return (
      <CodeMirrorStatic
        value={input ?? ""}
        options={OPTIONS}
        style={{ background: "white", padding: "10px" }}
      />
    );
  }
}
