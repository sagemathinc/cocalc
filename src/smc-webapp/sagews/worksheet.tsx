/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
React component to render a Sage worksheet statically (for use by share server or public mode)
*/

import * as React from "react";

import { sortBy } from "lodash";
import { Cell } from "./cell";
import { Cell as CellType } from "./parse-sagews";

interface Props {
  sagews: CellType[];
  style?: object;
}

export function Worksheet({ sagews, style }: Props) {
  function renderCell(cell: CellType): JSX.Element {
    return (
      <Cell
        key={cell.id}
        input={cell.input ? cell.input : ""}
        output={cell.output ? cell.output : {}}
        flags={cell.flags ? cell.flags : ""}
      />
    );
  }

  function renderCells(): JSX.Element[] {
    const cells: CellType[] = [];
    for (const cell of sagews) {
      if (cell.type === "cell") {
        cells.push(cell);
      }
    }
    sortBy(cells, ["pos"]);
    const v: JSX.Element[] = [];
    for (const cell of cells) {
      v.push(renderCell(cell));
    }
    return v;
  }

  return <div style={style}>{renderCells()}</div>;
}
