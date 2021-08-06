/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Rendering input part of a Sage worksheet cell
*/

import React from "react";
import { CodeMirrorStatic } from "@cocalc/frontend/jupyter/codemirror-static";
import { FLAGS } from "@cocalc/util/sagews";

const OPTIONS = { mode: { name: "sagews" } };

interface Props {
  input?: string;
  flags?: string;
}

export default function CellInput({ input, flags }: Props) {
  if (flags?.includes(FLAGS.hide_input)) {
    return <span />;
  }
  return (
    <CodeMirrorStatic
      value={input ?? ""}
      options={OPTIONS}
      style={{ background: "white", padding: "10px" }}
    />
  );
}
