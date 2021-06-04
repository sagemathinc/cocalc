// This react component is displayed as quickly as possible
// right when the page starts loading.  It doesn't depend on
// loading everything else.
// (NOTE: this replaces what was once "webapp-lib/app.pug".)

import * as React from "react";
import * as ReactDOM from "react-dom";

import LoadScripts from "./load-scripts";
import Favicons from "./favicons";
import Meta from "./meta";

ReactDOM.render(
  <div style={{ fontFamily: "sans-serif" }}>
    <img src={`${BASE_URL}/webapp/favicon.ico`} />
  </div>,
  document.getElementById("cocalc-load-container")
);

ReactDOM.render(
  <span>
    <Meta />
    <Favicons />
    <LoadScripts />
  </span>,
  document.getElementById("cocalc-scripts-container")
);
