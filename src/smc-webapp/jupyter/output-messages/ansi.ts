/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as Ansi from "ansi-to-react";
export { Ansi };

export function is_ansi(s: any): boolean {
  return (
    typeof s === "string" &&
    (s.indexOf("\u001b") !== -1 ||
      s.indexOf("\r") != -1 || // For \r and \b below, see https://github.com/sagemathinc/cocalc/issues/2520
      s.indexOf("\b") != -1)
  );
}
