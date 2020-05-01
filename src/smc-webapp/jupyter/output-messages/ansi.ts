/* 
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

export const Ansi = require("ansi-to-react");

export function is_ansi(s: any): boolean {
  return typeof s === "string" && s.indexOf("\u001b") !== -1;
}
