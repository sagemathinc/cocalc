/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { formatSelectedText } from "./commands";
import { register } from "../keyboard/register";

function format(mark: string) {
  return ({ editor }) => {
    formatSelectedText(editor, mark);
    return true;
  };
}

for (const mod of ["ctrl", "meta"]) {
  register({ key: "b", [mod]: true }, format("bold"));
  register({ key: "i", [mod]: true }, format("italic"));
  register({ key: "u", [mod]: true }, format("underline"));
  register({ key: "x", shift: true, [mod]: true }, format("strikethrough"));

  // TODO: This code one is undocumented and I just made it up.
  register({ key: "c", shift: true, [mod]: true }, format("code"));
}
