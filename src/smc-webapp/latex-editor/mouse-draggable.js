/* jQuery plugin to make a div mouse click draggable. */

import { throttle } from "underscore";

$.fn.mouse_draggable = function() {
    this.each(mouse_draggable);
};

function mouse_draggable() {
    const elt = $(this);
    window.elt = elt;
    let dragpos = null;

    elt.on("mousedown", e => {
        e.preventDefault();
        // Still need to remove the focus from the codemirror textarea
        // otherwise, space-key and others have no effect on scrolling.
        document.activeElement.blur();
        elt.on("mousemove", mousemove_handler);
        dragpos = {
            left: e.clientX,
            top: e.clientY
        };
    });

    function reset() {
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
        const delta = {
            left: e.clientX - dragpos.left,
            top: e.clientY - dragpos.top
        };
        elt.scrollLeft(elt.scrollLeft() - delta.left);
        elt.scrollTop(elt.scrollTop() - delta.top);
        dragpos = {
            left: e.clientX,
            top: e.clientY
        };
        return false;
    };
}
