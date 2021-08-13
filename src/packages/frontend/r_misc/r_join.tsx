/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import React from "react";
import { len } from "@cocalc/util/misc";

export function r_join(
  components: JSX.Element[],
  sep: string | JSX.Element = ", "
): JSX.Element[] {
  const v: JSX.Element[] = [];
  const n: number = len(components);
  for (let i: number = 0; i < components.length; i++) {
    const x: JSX.Element = components[i];
    v.push(x);
    if (i < n - 1) {
      v.push(<span key={-i - 1}>{sep}</span>);
    }
  }
  return v;
}
