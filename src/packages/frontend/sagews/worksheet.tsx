/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
React component to render a Sage worksheet statically.  This is
mainly for use by server-side share server, so needs to run fine
under node.js and in the frotend.
*/

import React from "react";
import { field_cmp } from "@cocalc/util/misc";
import Cell from "./cell";
import type { Cell as CellType } from "./parse-sagews";

interface Props {
  sagews: CellType[];
  style?: React.CSSProperties;
}

export default function Worksheet({ sagews, style }: Props) {
  const cells: CellType[] = [];
  for (const cell of sagews) {
    if (cell.type === "cell") {
      cells.push(cell);
    }
  }
  cells.sort(field_cmp("pos"));
  const v: JSX.Element[] = [];
  for (const cell of cells) {
    const { id, input, output, flags } = cell;
    v.push(
      <Cell
        key={id}
        input={input ?? ""}
        output={output ?? {}}
        flags={flags ?? ""}
      />
    );
  }

  return <div style={style}>{v}</div>;
}
