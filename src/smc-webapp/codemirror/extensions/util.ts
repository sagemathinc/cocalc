/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

export function cm_start_end(
  selection
): { start_line: number; end_line: number } {
  const { head, anchor } = selection;
  let start = head;
  let end = anchor;
  if (
    end.line <= start.line ||
    (end.line === start.line && end.ch <= start.ch)
  ) {
    [start, end] = [end, start];
  }
  const start_line = start.line;
  let end_line = end.ch > 0 ? end.line : end.line - 1;
  if (end_line < start_line) {
    end_line = start_line;
  }
  return { start_line, end_line };
}
