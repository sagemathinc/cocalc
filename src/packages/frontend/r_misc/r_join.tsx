/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import React from "react";
import { len } from "@cocalc/util/misc";

export function r_join(
  components: (JSX.Element | null | undefined)[],
  sep: string | JSX.Element = ", "
): JSX.Element[] {
  const w: JSX.Element[] = [];
  for (const c of components) {
    if (c != null) {
      w.push(c);
    }
  }
  const v: JSX.Element[] = [];
  const n: number = len(w);
  for (let i: number = 0; i < w.length; i++) {
    const x: JSX.Element = w[i];
    v.push(x);
    if (i < n - 1) {
      v.push(<span key={-i - 1}>{sep}</span>);
    }
  }
  return v;
}
