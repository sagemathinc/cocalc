/* jQuery plugin to make a div mouse click draggable. */

// **BUG**: need to take into account CSS zoom... ?

import * as $ from "jquery";

import { throttle } from "underscore";

declare global {
    interface JQuery {
        mouse_draggable(): JQuery;
    }
}

$.fn.mouse_draggable = function() {
    this.each(mouse_draggable);
    return this;
};

type coord = number | undefined;

interface Position {
    left: coord;
    top: coord;
}

function mouse_draggable(): void {
    // the element that is being dragged around.
    const elt = $(this);

    // dragpos = the position that the user just dragged the document to
    let dragpos: Position = { left: undefined, top: undefined };

    // when the mouse button goes down, we change the cursor, initialize the dragpos,
    // and activate the mousemove handler.
    elt.on("mousedown", e => {
        e.preventDefault();
        // Still need to remove the focus from the codemirror textarea
        // otherwise, space-key and others have no effect on scrolling.
        $(document.activeElement).blur();
        elt.css("cursor", "move");
        dragpos = {
            left: e.clientX,
            top: e.clientY
        };
        elt.on("mousemove", mousemove_handler);
    });

    // done with dragging document around -- reset cursor to default, and stop listening for mouse movement.
    function reset(): void {
        elt.css("cursor", "");
        elt.off("mousemove", mousemove_handler);
    }

    // finished dragging -- reset everything.
    elt.on("mouseup", e => {
        e.preventDefault();
        reset();
        return false;
    });

    // handle mouse moving with button down.
    const mousemove_handler = e => {
        e.preventDefault();

        // this checks, if we come back into the viewport after leaving it
        // but the mouse button is no longer pressed
        if (e.which !== 1) {
            reset();
            return;
        }

        // if any positions are undefined, which maybe technically could happen, do not do anything -- just
        // wait for the user to lift their mouse button.  (Basically, this satisfies the typescript.)
        if (
            dragpos.left === undefined ||
            dragpos.top === undefined ||
            e.clientX === undefined ||
            e.clientY === undefined
        )
            return;

        const delta = {
            left: e.clientX - dragpos.left,
            top: e.clientY - dragpos.top
        };
        const left: coord = elt.scrollLeft(),
            top: coord = elt.scrollTop();
        if (left === undefined || top === undefined) return;

        elt.scrollLeft(left - delta.left);
        elt.scrollTop(top - delta.top);

        dragpos = {
            left: e.clientX,
            top: e.clientY
        };
        return false;
    };
}
