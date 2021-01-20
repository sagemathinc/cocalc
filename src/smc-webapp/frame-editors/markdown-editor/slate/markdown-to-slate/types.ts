/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

export interface Marks {
  italic?: boolean;
  bold?: boolean;
  strikethrough?: boolean;
  underline?: boolean;
  sup?: boolean;
  sub?: boolean;
  color?: string;
  code?: boolean;
}

export interface State {
  marks: Marks;
  nesting: number;

  open_type?: string;
  close_type?: string;
  contents?: Token[];
  attrs?: string[][];
  block?: boolean;
}

export interface Token {
  hidden?: boolean; // See https://markdown-it.github.io/markdown-it/#Token.prototype.hidden
  type: string;
  tag?: string;
  attrs?: string[][];
  children?: Token[];
  content: string;
  block?: boolean;
  markup?: string;
  checked?: boolean;
  info?: string;
}
