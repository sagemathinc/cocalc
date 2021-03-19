/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Token } from "../../../../markdown";
export { Token };

export interface Marks {
  italic?: boolean;
  bold?: boolean;
  strikethrough?: boolean;
  underline?: boolean;
  sup?: boolean;
  sub?: boolean;
  color?: string;
}

export interface State {
  marks: Marks;
  nesting: number;

  open_type?: string;
  close_type?: string;
  contents?: Token[];
  attrs?: string[][];
  block?: boolean;
  markdown?: string;
}
