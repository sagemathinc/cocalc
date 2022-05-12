/*
For full html messages, instead of sanitizing html via html-ssr.tsx, we just put the html in a big iframe.

This makes it so, e.g., plotly plots, which are NOT embedded in an iframe, still just work with our
public nbviewer.

Note that some HTML, e.g., anything embedded in markdown cells, still gets rendered via sanitized html.
*/

import { useEffect, useRef } from "react";
import register from "./register";
import useIsMountedRef from "@cocalc/frontend/app-framework/is-mounted-hook";

const IframeHtml = ({ value }) => {
  const iframeRef = useRef<any>(null);
  const isMountedRef = useIsMountedRef();
  // After mounting, we measure the content of the iframe and resize to better fit it.
  // TODO: Might wnat to switch to https://www.npmjs.com/package/iframe-resizer-react
  // instead of the hack of timeouts below...
  useEffect(() => {
    if (iframeRef.current == null) return;
    const f = () => {
      if (iframeRef.current != null && isMountedRef.current) {
        iframeRef.current.height = `${
          iframeRef.current.contentWindow.document.documentElement
            ?.offsetHeight ?? 600
        }px`;
      }
    };
    f();
    setTimeout(f, 10);
    setTimeout(f, 250);
  }, []);

  return (
    <iframe
      ref={iframeRef}
      width="100%"
      height={
        "600px" /* Kind of arbitrary -- but overflow auto below, so scrollable */
      }
      style={{ overflow: "auto", border: 0 }}
      src={value}
      srcDoc={value}
      sandbox="allow-forms allow-scripts allow-same-origin"
    />
  );
};

register("text/html", 5, IframeHtml);
