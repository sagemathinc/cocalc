/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { dmp } from "smc-util/sync/editor/generic/util";

interface Op {
  type: "insert_text" | "remove_text";
  offset: number;
  text: string;
}

export function slateTextDiff(a: string, b: string): Op[] {
  const diff = dmp.diff_main(a, b);

  const operations: Op[] = [];

  let offset = 0;
  let i = 0;
  while (i < diff.length) {
    const chunk = diff[i];
    const op = chunk[0]; // -1 = delete, 0 = leave unchanged, 1 = insert
    const text = chunk[1];
    if (op === 0) {
      // skip over context, since this diff applies cleanly
      offset += text.length;
    } else if (op === -1) {
      // remove some text.
      operations.push({ type: "remove_text", offset, text });
    } else if (op == 1) {
      // insert some text
      operations.push({ type: "insert_text", offset, text });
      offset += text.length;
    }
    i += 1;
  }
  console.log("slateTextDiff", { a, b, diff, operations });

  return operations;
}
