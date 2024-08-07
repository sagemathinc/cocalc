/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

export interface Pos {
  line: number;
  ch: number;
}

export interface ChangeObject {
  from: Pos;
  to: Pos;
  text: string[];
  next?: ChangeObject;
}
