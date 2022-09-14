/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { ReactNode } from "react";

export function r_human_list(components: ReactNode[]): JSX.Element {
  const l = components.filter((c) => c != null);
  const v: ReactNode[] = [];
  for (let i: number = 0; i < l.length; i++) {
    v.push(l[i]);
    if (i < l.length - 1) {
      const sep = l.length >= 2 && i == l.length - 2 ? " and " : ", ";
      v.push(<span key={-i - 1}>{sep}</span>);
    }
  }
  return <>{v}</>;
}
