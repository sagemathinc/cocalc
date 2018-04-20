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
    const elt = $(this);
    let dragpos: Position = { left: undefined, top: undefined };

    elt.on("mousedown", e => {
        e.preventDefault();
        // Still need to remove the focus from the codemirror textarea
        // otherwise, space-key and others have no effect on scrolling.
        $(document.activeElement).blur();
        elt.on("mousemove", mousemove_handler);
        dragpos = {
            left: e.clientX,
            top: e.clientY
        };
    });

    function reset(): void {
        elt.css("cursor", "");
        elt.off("mousemove", mousemove_handler);
    }

    elt.on("mouseup", e => {
        e.preventDefault();
        reset();
        return false;
    });

    const mousemove_handler = e => {
        e.preventDefault();

        // this checks, if we come back into the viewport after leaving it
        // but the mouse is no longer pressed
        if (e.which !== 1) {
            reset();
            return;
        }
        elt.css("cursor", "move");

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
