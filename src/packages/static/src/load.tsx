// This react component is displayed as quickly as possible
// right when the page starts loading.  It doesn't depend on
// loading everything else.

import "./init-app-base-path";
// @ts-ignore
import ReactDOM from "react-dom";
import Favicons from "./favicons";
import Manifest from "./manifest";
import Meta from "./meta";
import PreflightCheck from "./preflight-checks";
import Primus from "./primus";
import StartupBanner from "./startup-banner";
import initError from "./webapp-error";

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
