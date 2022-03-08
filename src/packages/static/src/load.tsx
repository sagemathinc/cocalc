// This react component is displayed as quickly as possible
// right when the page starts loading.  It doesn't depend on
// loading everything else.
// (NOTE: this replaces what was once "app.pug".)

import "./init-app-base-path";
// @ts-ignore
import ReactDOM from "react-dom";
import Primus from "./primus";
import Manifest from "./manifest";
import PreflightCheck from "./preflight-checks";
import initError from "./webapp-error";
import Favicons from "./favicons";
import Meta from "./meta";
import StartupBanner from "./startup-banner";

initError();

ReactDOM.render(
  <>
    <Primus />
    <Manifest />
    <PreflightCheck />
    <StartupBanner />
  </>,
  document.getElementById("cocalc-load-container")
);

ReactDOM.render(
  <span>
    <Meta />
    <Favicons />
  </span>,
  document.getElementById("cocalc-scripts-container")
);
