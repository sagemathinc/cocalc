/*
Load react support for rendering.
*/

// Code for rendering react components to html.
import * as ReactDOMServer from "react-dom/server";

import "./jsdom-support";

// Uncomment for cc-in-cc dev benchmarking purposes.  This variable is already set
// by the Docker container when running in kubernetes.
//# process.NODE_ENV="production"

import { set_share_server } from "smc-webapp/r_misc/share-server";

set_share_server(true);

// Load katex jQuery plugin.
require("smc-webapp/jquery-plugins/katex");

export function react(res, component, extra: any = ""): void {
  res.type("html");
  const t0 = new Date().valueOf();
  const stream = ReactDOMServer.renderToStaticNodeStream(component);
  stream.pipe(res);
  stream.once("end", () =>
    console.log(
      `react: time to render and stream out: ${new Date().valueOf() - t0}ms`,
      extra
    )
  );
}
