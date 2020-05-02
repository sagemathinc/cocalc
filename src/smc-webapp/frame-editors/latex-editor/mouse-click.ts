/* 
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

export function dblclick(x: number, y: number): void {
  const ev = new MouseEvent("dblclick", {
    view: window,
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
  });

  const element = document.elementFromPoint(x, y);
  if (element != undefined) {
    element.dispatchEvent(ev);
  }
}
