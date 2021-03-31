/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as CodeMirror from "codemirror";

/*
Find pos {line:line, ch:ch} of first line that contains the
string s, or returns undefined if no single line contains s.
Should be much faster than calling getLine or getValue.
*/

CodeMirror.defineExtension("find_in_line", function (
  s: string
): CodeMirror.Position | undefined {
  // @ts-ignore
  const cm: any = this;

  let line: number = -1;
  let ch: number = 0;
  let i = 0;
  cm.eachLine(function (z) {
    ch = z.text.indexOf(s);
    if (ch !== -1) {
      line = i;
      return true; // undocumented - calling false stops iteration
    }
    i += 1;
    return false;
  });
  if (line >= 0) {
    return { line, ch };
  }
});
