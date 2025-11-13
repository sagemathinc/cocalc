/*
For full html messages, by default instead of sanitizing html via html-ssr.tsx, we just
put the html in a big iframe.

This makes it so, e.g., plotly plots, which are NOT embedded in an iframe, still just work with our
public nbviewer.

Note that some HTML, e.g., anything embedded in markdown cells, still gets rendered via sanitized html.
Also if heuristics suggest the html is just math typesetting, e.g., as output by Sage, then
we also use sanitized html.
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
    if (iframeRef.current == null) {
      return;
    }
    const f = () => {
      if (iframeRef.current != null && isMountedRef.current) {
        try {
          iframeRef.current.height = `${
            iframeRef.current.contentWindow.document.documentElement
              ?.offsetHeight ?? 600
          }px`;
        } catch (_err) {
          // this fails on the share server for security reasons, which is good.
        }
      }
    };
    f();
    setTimeout(f, 10);
    setTimeout(f, 250);
  }, []);

  let src: undefined | string = undefined;
  let srcDoc: undefined | string = undefined;
  if (
    value.startsWith("https:") ||
    value.startsWith("http:") ||
    value.startsWith("blob:")
  ) {
    src = value;
  } else {
    srcDoc = value;
  }
  return (
    <iframe
      ref={iframeRef}
      width="100%"
      height={
        "600px" /* Kind of arbitrary -- but overflow auto below, so scrollable */
      }
      style={{ overflow: "auto", border: 0 }}
      src={src}
      srcDoc={srcDoc}
      sandbox="allow-forms allow-scripts allow-presentation"
    />
  );
};

register("text/html", 5, ({ value }) => {
  return <IframeHtml value={value} />;
});
