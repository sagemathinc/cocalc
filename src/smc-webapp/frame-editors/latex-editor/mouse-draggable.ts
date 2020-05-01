/* 
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as $ from "jquery";

declare global {
  interface JQuery {
    mouse_draggable(): JQuery;
  }
}

$.fn.mouse_draggable = function () {
  this.each(mouse_draggable);
  return this;
};

type coord = number;

interface Position {
  left: coord;
  top: coord;
}

function mouse_draggable(): void {
  // the element that is being dragged around.
  const elt = $(this);

  // dragpos = the position that the user just dragged the document to
  let dragpos: Position;

  // when the mouse button goes down, we change the cursor, initialize the dragpos,
  // and activate the mousemove handler.
  elt.on("mousedown", (e) => {
    e.preventDefault();
    // Still need to remove the focus from the codemirror textarea
    // otherwise, space-key and others have no effect on scrolling.
    ($ as any)(document.activeElement).blur();

    elt.css("cursor", "move");
    if (e.clientX == undefined || e.clientY == undefined) return; // do not bother
    dragpos = {
      left: e.clientX,
      top: e.clientY,
    };
    elt.on("mousemove", mousemove_handler);
  });

  // done with dragging document around -- reset cursor to default, and stop listening for mouse movement.
  function reset(): void {
    elt.css("cursor", "");
    elt.off("mousemove", mousemove_handler);
  }

  // finished dragging -- reset everything.
  elt.on("mouseup", (e) => {
    e.preventDefault();
    reset();
    return false;
  });

  // handle mouse moving with button down.
  const mousemove_handler = (e) => {
    e.preventDefault();

    // this checks, if we come back into the viewport after leaving it
    // but the mouse button is no longer pressed
    if (e.which !== 1) {
      reset();
      return;
    }

    // if any positions are undefined, which maybe technically could happen, do not do anything -- just
    // wait for the user to lift their mouse button.  (Basically, this satisfies the typescript.)
    if (e.clientX == undefined || e.clientY == undefined) return;

    const delta = {
      x: e.clientX - dragpos.left,
      y: e.clientY - dragpos.top,
    };

    elt.scrollLeft(<number>elt.scrollLeft() - delta.x);
    elt.scrollTop(<number>elt.scrollTop() - delta.y);

    dragpos = {
      left: e.clientX,
      top: e.clientY,
    };
    return false;
  };
}
