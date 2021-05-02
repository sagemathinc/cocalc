/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Rendering a Sage worksheet cell
*/

import * as React from "react";

import { CellInput } from "./input";
import { CellOutput } from "./output";

interface Props {
  input: string;
  output: object;
  flags: string;
}

export function Cell({ input, output, flags }: Props) {
  return (
    <div>
      <CellInput input={input} flags={flags} />
      {output != null && <CellOutput output={output} flags={flags} />}
    </div>
  );
}
