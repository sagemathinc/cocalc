/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Node } from "slate";

export function markdown_to_slate(text): Node[] {
  return [
    {
      type: "paragraph",
      children: [{ text }],
    },
  ];
}
