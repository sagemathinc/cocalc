/*
Create stable unsafe HTML DOM node.  This is a way to render HTML that stays stable
irregardless of it being unmounted/remounted.

This supports virtualization, window splitting, etc., without loss of state,
unless there are too many of them, then we delete the oldest.

By default, the HTML is just directly put into the DOM exactly as is, except that
we *do* process links so internal references work and math using katex.

Unsafe is in the name since there is NO SANITIZATION.  Only use this on trusted
documents.

Elements only get re-rendered when for IDLE_TIMEOUT_S, both:

- the underlying react element does not exist, AND
- the parent is not scrolled at all.

OR

- if there are more than MAX_ELEMENTS, then the oldest are removed (to avoid catastrophic memory usage).

If for any reason the react element exists or the parent is scrolled, then
the idle timeout is reset.
*/

import { useCallback, useEffect, useRef } from "react";
import $ from "jquery";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import { useStableHtmlContext } from "@cocalc/frontend/jupyter/cell-list";
import { sha1 } from "@cocalc/util/misc";
import TTL from "@isaacs/ttlcache";

// AFter this many seconds, an element that hasn't been in the react dom and whose
// parent hasn't been scrolled, will get un-rendered.
const IDLE_TIMEOUT_S = 10 * 60; // 10 minutes
// If there are more than this many elements, old ones are un-rendered.
const MAX_ELEMENTS = 500; // max items
// Rough assumption about size of scrollbar.
const SCROLL_WIDTH = 30;
// we have to put the html on top of the notebook to be visible.  This is the z-index we use.
const Z_INDEX = 1;

// POSITION_WHEN_MOUNTED_INTERVAL_MS: No matter what when the html is in the REACT
// dom, it will have its position updated this frequently.
// it also gets updated on scroll of the cell list. This also serves to
// ensure that this item has a recent ttl so it isn't cleared from the ttl cache.
// It should NOT ever actually be needed, since we always update the position on
// resize and scroll events.
const POSITION_WHEN_MOUNTED_INTERVAL_MS = 10000;

// Scroll actively this many frames after each update, due to throttling of onscroll
// and other events. This is to eliminate lag.
const SCROLL_COUNT = 60;

const cache = new TTL<string, any>({
  ttl: IDLE_TIMEOUT_S * 1000,
  max: MAX_ELEMENTS,
  updateAgeOnGet: true,
  dispose: (elt) => {
    elt.empty();
    elt.remove();
  },
});

// make it really standout:
const PADDING = 5;
const STYLE = {
  border: "1px solid #ccc",
  borderRadius: "5px",
  padding: `${PADDING}px`,
} as const;

// // make it blend in
// const PADDING = 0;
// const STYLE = {} as const;

interface Props {
  docId: string;
  html: string;
  zIndex?: number;
}

export default function StableUnsafeHtml({
  docId,
  html,
  zIndex = Z_INDEX, // todo: support changing?
}: Props) {
  const divRef = useRef<any>(null);
  const cellOutputDivRef = useRef<any>(null);
  const intervalRef = useRef<any>(null);
  const { isVisible, project_id, path, id } = useFrameContext();
  const stableHtmlContext = useStableHtmlContext();
  const htmlRef = useRef<string>(html);
  const globalKeyRef = useRef<string>(
    sha1(`${project_id}-${id}-${docId}-${path}-${html}`),
  );

  const position = useCallback(() => {
    // make it so elt is exactly positioned on top of divRef.current using CSS
    if (divRef.current == null) {
      return;
    }
    const jElt = jupyterGetElt();
    const elt = jElt[0];
    const eltRect = elt.getBoundingClientRect();
    const divRect = divRef.current.getBoundingClientRect();

    // position our immortal html element
    let deltaTop = divRect.top - eltRect.top;
    if (deltaTop) {
      if (elt.style.top) {
        deltaTop += parseFloat(elt.style.top.slice(0, -2));
      }
      elt.style.top = `${deltaTop + PADDING}px`;
    }
    let deltaLeft = divRect.left - eltRect.left;
    if (deltaLeft) {
      if (elt.style.left) {
        deltaLeft += parseFloat(elt.style.left.slice(0, -2));
      }
      elt.style.left = `${deltaLeft + PADDING}px`;
    }

    // set the size of the actual react div that is in place
    divRef.current.style.height = `${
      eltRect.bottom - eltRect.top + 2 * PADDING
    }px`;
    //     divRef.current.style.width = `${
    //       eltRect.right - eltRect.left + 2 * PADDING
    //     }px`;

    // clip our immortal html so it isn't visible outside the parent
    const parent = stableHtmlContext.cellListDivRef?.current;
    if (parent != null) {
      const parentRect = parent.getBoundingClientRect();
      // Calculate the overlap area
      const top = Math.max(0, parentRect.top - eltRect.top);
      // leave 30px on right so to not block scrollbar
      const right = Math.min(
        eltRect.width,
        parentRect.right - SCROLL_WIDTH - eltRect.left,
      );

      // The bottom is complicated because if the output is COLLAPSED, then the html doesn't
      // go outside the shortened div.  We do not do anything regarding making
      // scroll work in there though -- if you want to see the whole thing, you
      // must not collapse it.
      const containerRect = cellOutputDivRef.current?.getBoundingClientRect();
      //console.log({ containerRect, parentRect, eltRect });

      const bottom = Math.max(
        top,
        Math.min(
          eltRect.height,
          (containerRect?.bottom ?? parentRect.bottom) - eltRect.top,
          parentRect.bottom - eltRect.top,
        ),
      );

      const left = Math.max(0, parentRect.left - eltRect.left);

      // Apply clip-path to elt to make it visible only inside of parentRect:
      elt.style.clipPath = `polygon(${left}px ${top}px, ${right}px ${top}px, ${right}px ${bottom}px, ${left}px ${bottom}px)`;

      // Set width, so it possible to scroll horizontally and see whatever widget is in the output.
      const w = divRef.current.offsetWidth;
      if (w) {
        elt.style.width = `${w}px`;
      }

      // if it's an iframe resize it
      if (html.toLowerCase().startsWith("<iframe")) {
        const iframe = jElt.find("iframe");
        if (iframe.length > 0) {
          var iframeBody = iframe.contents().find("body");
          if (iframeBody.length > 0) {
            // Get dimensions of the iframe's body
            const height = iframeBody.outerHeight();
            iframe[0].style.height = `${height}px`;
          }
        }
      }

      // This below sort of makes it so in some cases scrolling still works.
      // It's flaky and not great, but perhaps the best we can do.
      // It breaks clicking on the html for 1s after scrolling it.
      let timer: any = 0;
      //elt.addEventListener("wheel", () => {
      elt.style.pointerEvents = "none";
      if (timer) {
        clearTimeout(timer);
      }
      timer = setTimeout(() => {
        timer = 0;
        // Re-enable pointer events after the scroll
        elt.style.pointerEvents = "auto";
      }, 1000);
      // });
    }
  }, []);

  // ATTENTION: this name jupyterGetElt is also assumed in src/packages/static/src/webapp-error.ts!!!
  const jupyterGetElt = () => {
    if (!cache.has(globalKeyRef.current)) {
      const elt = $(
        `<div id="${globalKeyRef.current}" style="border:0;position:absolute;overflow:auto;z-index:${zIndex}"/>${html}</div>`,
      );
      // @ts-ignore
      elt.process_smc_links();
      // @ts-ignore
      elt.katex({ preProcess: true });

      let timer: any = 0;
      const elt0 = elt[0];
      elt0.addEventListener("wheel", () => {
        elt0.style.pointerEvents = "none";
        if (timer) {
          clearTimeout(timer);
        }
        timer = setTimeout(() => {
          timer = 0;
          elt0.style.pointerEvents = "auto";
        }, 2000);
      });

      cache.set(globalKeyRef.current, elt);
      $("body").append(elt);
      return elt;
    } else {
      return cache.get(globalKeyRef.current);
    }
  };

  const show = () => {
    if (divRef.current == null) {
      return;
    }
    const elt = jupyterGetElt();
    elt.show();
    position();
  };

  const hide = () => {
    // unmounting so hide
    const elt = jupyterGetElt();
    elt.hide();
  };

  useEffect(() => {
    if (isVisible) {
      show();
      return hide;
    }
  }, [isVisible]);

  useEffect(() => {
    if (htmlRef.current == html) {
      return;
    }
    // html was mutated (e.g., happens with transient messages or and collab), so update the
    // element in place.
    htmlRef.current = html;
    const elt = jupyterGetElt();
    elt.html(html);
  }, [html]);

  useEffect(() => {
    intervalRef.current = setInterval(
      position,
      POSITION_WHEN_MOUNTED_INTERVAL_MS,
    );
    if (stableHtmlContext.scrollOrResize != null) {
      let count = 0;
      stableHtmlContext.scrollOrResize[globalKeyRef.current] = async () => {
        if (count > 0) {
          return;
        }
        // We run position a lot whenever there is a scroll
        // in order to make it so the iframe doesn't appear
        // to just get "dragged along" nearly as much, as
        // onScroll is throttled.
        count = SCROLL_COUNT;
        while (count > 0) {
          position();
          await new Promise(requestAnimationFrame);
          count -= 1;
        }
        // throw in an update when we're done.
        position();
      };
    }
    position();
    setTimeout(position, 0);

    return () => {
      delete stableHtmlContext.scrollOrResize?.[globalKeyRef.current];
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  useEffect(() => {
    // This is "old fashioned jquery"... but I tried passing this info
    // down via stableHtmlContext and it gets REALLY complicated.
    // Also this only happens once on mount, so it's not a problem
    // regarding efficiency.
    cellOutputDivRef.current = $(divRef.current).closest(
      ".cocalc-output-div",
    )[0];
  }, []);

  return <div ref={divRef} style={STYLE}></div>;
}
