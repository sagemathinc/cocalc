/*

It is completely impossible in modern times to move an iframe in the DOM without loosing state,
as explained here:
   https://stackoverflow.com/questions/8318264/how-to-move-an-iframe-in-the-dom-without-losing-its-state

An annoying issue is that if you do shift+tab to get docs or hit the TimeTravel button or anything to
split the Jupyter frame, then the iframes of course get reset.  That was a problem before this though,
i.e., it's not special to using windowing.
*/

import { useCallback, useEffect, useMemo, useRef } from "react";
import { get_blob_url } from "../server-urls";
import { useIFrameContext } from "@cocalc/frontend/jupyter/cell-list";
import { delay } from "awaiting";
import useIsMountedRef from "@cocalc/frontend/app-framework/is-mounted-hook";

const HEIGHT = "600px";

interface Props {
  sha1: string;
  project_id: string;
  cacheId: string;
}

export default function CachedIFrame({ cacheId, sha1, project_id }: Props) {
  const divRef = useRef<any>(null);
  const eltRef = useRef<any>(null);
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

  useEffect(() => {
    if (divRef.current == null) return;
    (async () => {
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
          )}" style="border:0;overflow:hidden;width:100%;height:${HEIGHT};position:absolute"/>`
        );
        holder.append(elt);
      }
      eltRef.current = elt[0];
      if (iframeContext.iframeOnScrolls != null) {
        let count = 0;
        iframeContext.iframeOnScrolls[key] = async () => {
          count = Math.min(200, count + 200);
          while (count > 0) {
            position();
            await new Promise(requestAnimationFrame);
            count -= 1;
          }
        };
      }
      elt.show();
      position();
    })();

    return () => {
      delete iframeContext.iframeOnScrolls?.[key];
      $(eltRef.current).hide();
    };
  }, [key]);

  return <div ref={divRef} style={{ height: HEIGHT, width: "100%" }}></div>;
}
