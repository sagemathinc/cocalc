/*

It is completely impossible in modern times to move an iframe in the DOM without loosing state,
as explained here:
   https://stackoverflow.com/questions/8318264/how-to-move-an-iframe-in-the-dom-without-losing-its-state

An annoying issue is that if you do shift+tab to get docs or hit the TimeTravel button or anything to
split the Jupyter frame, then the iframes of course get reset.  That was a problem before this though,
i.e., it's not special to using windowing.
*/

import { Button } from "antd";
import { Icon } from "@cocalc/frontend/components/icon";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { get_blob_url } from "../server-urls";
import { useIFrameContext } from "@cocalc/frontend/jupyter/cell-list";
import { delay } from "awaiting";
import useIsMountedRef from "@cocalc/frontend/app-framework/is-mounted-hook";
import useResizeObserver from "use-resize-observer";

// This is just an initial default height; the actual height of the iframe resizes to the content.
const HEIGHT = "70vh";

interface Props {
  sha1: string;
  project_id: string;
  cacheId: string;
}

export default function CachedIFrame({ cacheId, sha1, project_id }: Props) {
  const divRef = useRef<any>(null);
  const eltRef = useRef<any>(null);
  const resize = useResizeObserver({ ref: divRef });
  const iframeContext = useIFrameContext();
  const isMountedRef = useIsMountedRef();
  const key = useMemo(() => {
    return `${cacheId}-${sha1}`;
  }, [cacheId, sha1]);

  const position = useCallback(() => {
    // make it so eltRef.current is exactly positioned on top of divRef.current using CSS
    if (eltRef.current == null || divRef.current == null) {
      return;
    }
    const eltRect = eltRef.current.getBoundingClientRect();
    const divRect = divRef.current.getBoundingClientRect();
    let deltaTop = divRect.top - eltRect.top;
    if (deltaTop) {
      if (eltRef.current.style.top) {
        deltaTop += parseFloat(eltRef.current.style.top.slice(0, -2));
      }
      eltRef.current.style.top = `${deltaTop}px`;
    }
    let deltaLeft = divRect.left - eltRect.left;
    if (deltaLeft) {
      if (eltRef.current.style.left) {
        deltaLeft += parseFloat(eltRef.current.style.left.slice(0, -2));
      }
      eltRef.current.style.left = `${deltaLeft}px`;
    }
  }, []);

  const updateSize = useCallback(() => {
    if (divRef.current == null || eltRef.current == null) {
      return;
    }
    // Set the width of the iframe to match the div:
    const divRect = divRef.current.getBoundingClientRect();
    eltRef.current.style.width = `${divRect.width}px`;
    // Set the height to match the contents:
    try {
      const height = Math.max(400, $(eltRef.current).contents().height() ?? 0);
      eltRef.current.style.height = `${height}px`;
      divRef.current.style.height = `${height}px`;
    } catch (_) {
      // height computation can throw.  That's fine.
    }
  }, []);

  const showIframe = useCallback(async () => {
    if (divRef.current == null) return;
    let holder = $(iframeContext.iframeDivRef?.current);
    if (holder.length == 0) {
      // when first mounting, we have to wait until next loop until the holder is rendered.
      await delay(0);
      if (!isMountedRef.current) return;
      holder = $(iframeContext.iframeDivRef?.current);
    }
    if (holder.length == 0) {
      console.log(`WARNING: iframe sha1=${sha1} failed to get holder!`);
      return;
    }
    let elt = holder.find(`#${key}`);
    if (elt.length == 0) {
      elt = $(
        `<iframe id="${key}" src="${get_blob_url(
          project_id,
          "html",
          sha1
        )}" style="border:0;overflow:hidden;width:100%;height:${HEIGHT};position:absolute;left:130px"/>`
      );
      holder.append(elt);
    }
    eltRef.current = elt[0];
    if (iframeContext.iframeOnScrolls != null) {
      let count = 0;
      iframeContext.iframeOnScrolls[key] = async () => {
        // We run position a lot whenever there is a scroll
        // in order to make it so the iframe doesn't appear
        // to just get "dragged along" nearly as much, as
        // onScroll is throttled.
        count = Math.min(100, count + 100);
        while (count > 0) {
          position();
          await new Promise(requestAnimationFrame);
          count -= 1;
        }
        // throw in a size update when we're done.
        updateSize();
      };
    }
    elt.show();
    position();
    updateSize();
    // really should wait until the iframe is loaded... though calling position/updateSize randomly
    // isn't harmful, and will happen on scrolling.
    await delay(500);
    position();
    updateSize();
  }, [key]);

  const reloadIframe = useCallback(async () => {
    let holder = $(iframeContext.iframeDivRef?.current);
    if (holder.length > 0) {
      holder.find(`#${key}`).remove();
    }
    await showIframe();
  }, [key]);

  useEffect(() => {
    updateSize();
  }, [resize]);

  useEffect(() => {
    showIframe();
    return () => {
      delete iframeContext.iframeOnScrolls?.[key];
      $(eltRef.current).hide();
    };
  }, [key]);

  return (
    <div ref={divRef} style={{ height: HEIGHT, width: "100%" }}>
      <Button
        style={{ float: "right", zIndex: 1, marginTop: "5px" }}
        onClick={reloadIframe}
      >
        <Icon name="reload" />
      </Button>
    </div>
  );
}
