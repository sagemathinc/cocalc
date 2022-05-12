/*
For full html messages, instead of sanitizing html via html-ssr.tsx, we just put the html in a big iframe.

This makes it so, e.g., plotly plots, which are NOT embedded in an iframe, still just work with our
public nbviewer.

Note that some HTML, e.g., anything embedded in markdown cells, still gets rendered via sanitized html.
*/

import { useEffect, useRef } from "react";
import register from "./register";

const IframeHtml = ({ value }) => {
  const iframeRef = useRef<any>(null);
  // After mounting, we measure the content of the iframe and resize to better fit it.
  // TODO: I'm not convinced this works at all; maybe a delay is needed in general, or
  // just fully use https://www.npmjs.com/package/iframe-resizer-react
  // This is important, but not today.
  useEffect(() => {
    if (iframeRef.current == null) return;
    iframeRef.current.height = `${
      iframeRef.current.contentWindow.document.documentElement?.offsetHeight ??
      600
    }px`;
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
