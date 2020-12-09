/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React, Rendered } from "../app-framework";
import { len } from "smc-util/misc";

export function r_join(
  components: Rendered[],
  sep: string | Rendered = ", "
): Rendered[] {
  const v: Rendered[] = [];
  const n: number = len(components);
  for (let i: number = 0; i < components.length; i++) {
    const x: Rendered = components[i];
    v.push(x);
    if (i < n - 1) {
      v.push(<span key={-i - 1}>{sep}</span>);
    }
  }
  return v;
}
