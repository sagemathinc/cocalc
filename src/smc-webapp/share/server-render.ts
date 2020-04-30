/*
Load react support for rendering.
*/

// Code for rendering react components to html.
import * as ReactDOMServer from "react-dom/server";

// Uncomment for cc-in-cc dev benchmarking purposes.  This variable is already set
// by the Docker container when running in kubernetes.
//# process.NODE_ENV="production"

import { set_share_server } from "../r_misc/share-server";

set_share_server(true);

// Load katex jQuery plugin.
require("../jquery-plugins/katex");

/* Regarding the stream parameter below:
   if true, use streaming non-blocking rendering;
   if false, blocks the server (no reason to use stream=false)
   There should never be a reason to use stream=false, except
   maybe for testing, but I implemented it so left it in.
*/
export function render(
  res,
  component,
  extra: any = "",
  stream: boolean = true
): void {
  res.type("html");
  res.write("<!DOCTYPE html>");
  const t0 = new Date().valueOf();
  if (stream) {
    const s = ReactDOMServer.renderToStaticNodeStream(component);
    s.pipe(res);
    s.once("end", () =>
      console.log(
        `react: time to render and stream out: ${new Date().valueOf() - t0}ms`,
        extra
      )
    );
  } else {
    const s = ReactDOMServer.renderToStaticMarkup(component);
    res.write(s);
    console.log(
      `react: time to render to string: ${
        new Date().valueOf() - t0
      }ms; length of string: ${s.length}`,
      extra
    );
    res.end();
  }
}
