/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import Anser from "anser";
import Ansi from "@cocalc/frontend/components/ansi-to-react";
export { Ansi };

export function is_ansi(s: any): boolean {
  return (
    typeof s === "string" &&
    (s.includes("\u001b") ||
      s.includes("\r") || // For \r and \b below, see https://github.com/sagemathinc/cocalc/issues/2520
      s.includes("\b"))
  );
}

export function toText(s: string): string {
  return Anser.ansiToText(s);
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
