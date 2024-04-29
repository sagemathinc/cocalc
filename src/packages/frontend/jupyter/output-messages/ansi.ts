/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import Anser from "anser";

let Ansi = require("@cocalc/ansi-to-react");
if (Ansi.default) {
  // Total hack to workaround some weird issue with Typescript, modules
  // and the share server.  Just doing `import Ansi from "ansi-to-react";`
  // works on the frontend but BREAK badly on the share server.
  // TODO: Fix this, since we're now upstream https://github.com/sagemathinc/ansi-to-react
  Ansi = Ansi.default;
}
export { Ansi };

export function is_ansi(s: any): boolean {
  return (
    typeof s === "string" &&
    (s.indexOf("\u001b") !== -1 ||
      s.indexOf("\r") != -1 || // For \r and \b below, see https://github.com/sagemathinc/cocalc/issues/2520
      s.indexOf("\b") != -1)
  );
}

// Extract a plain-text representation of a given cell
export function cellOutputToText(cell): string {
  const raw = cell.get("output");
  if (!raw) return "";

  const output: string[] = [];

  for (let i = 0; i < raw.size; i++) {
    const o = raw.get(`${i}`)?.toJS();

    const txt = o?.data?.["text/plain"];
    if (typeof txt === "string") {
      output.push(txt);
    }

    if (typeof o.text === "string") {
      output.push(o.text);
    }

    if (o.traceback != null) {
      const trace = o.traceback.join("\n");
      output.push(Anser.ansiToText(trace));
    }

    output.push();
  }

  return output.join("\n");
}
