/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

export function shouldOpenFileInNewWindow(e?: React.MouseEvent) {
  if (e == null) return false;
  return e.ctrlKey || e.shiftKey || e.metaKey;
}
