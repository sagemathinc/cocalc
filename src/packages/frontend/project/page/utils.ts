/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

export function shouldOpenFileInNewWindow(e?: React.MouseEvent) {
  if (e == null) return false;
  return e.ctrlKey || e.shiftKey || e.metaKey;
}

