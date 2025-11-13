// This react component is displayed as quickly as possible
// right when the page starts loading.  It doesn't depend on
// loading everything else.

import "./init-app-base-path";
import { createRoot } from "react-dom/client";
import Favicons from "./favicons";
import Manifest from "./manifest";
import Meta from "./meta";
import PreflightCheck from "./preflight-checks";
import StartupBanner from "./startup-banner";
import initError from "./webapp-error";

initError();

const loadContainer = document.getElementById("cocalc-load-container");
if (loadContainer) {
  createRoot(loadContainer).render(
    <>
      <PreflightCheck />
      <StartupBanner />
    </>
  );
} else {
  throw Error(
    "there must be a div with id cocalc-load-container in the document!"
  );
}

const scriptsContainer = document.getElementById("cocalc-scripts-container");
if (scriptsContainer != null) {
  createRoot(scriptsContainer).render(
    <span>
      <Manifest />
      <Meta />
      <Favicons />
    </span>
  );
} else {
  throw Error(
    "there must be a div with id cocalc-scripts-container in the document!"
  );
}
