// Load the custom manifest for our site, which is necessary so that we can
// install the page as a local webapp.  It's part of being a "progressive
// web app", as was started in this PR: https://github.com/sagemathinc/cocalc/pull/5254

import * as React from "react";
import { Helmet } from "react-helmet";
import { join } from "path";

declare const BASE_PATH: string; // defined via webpack

const path = "./webapp/serviceWorker.js";

window.addEventListener("load", async function () {
  try {
    await navigator.serviceWorker.register(path, {
      scope: BASE_PATH,
    });
    console.log(`${path} registered successful`);
  } catch (err) {
    console.log(`${path} registration failed: `, err);
  }
});

export default function Manifest() {
  return (
    <Helmet>
      <link rel="manifest" href={join(BASE_PATH, "customize?type=manifest")} />
    </Helmet>
  );
}
