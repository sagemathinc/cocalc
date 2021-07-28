// Load the custom manifest for our site, which is necessary so that we can
// install the page as a local webapp.  It's part of being a "progressive
// web app", as was started in this PR: https://github.com/sagemathinc/cocalc/pull/5254

import * as React from "react";
import { Helmet } from "react-helmet";
import { join } from "path";

window.addEventListener("load", async function () {
  const path = join(window.app_base_path, "webapp/serviceWorker.js");

  try {
    await navigator.serviceWorker.register(path, {
      scope: window.app_base_path,
    });
    console.log(`${path} registered successful`);
  } catch (err) {
    console.log(`${path} registration failed: `, err);
  }
});

export default function Manifest() {
  return (
    <Helmet>
      <link
        rel="manifest"
        href={join(window.app_base_path, "customize?type=manifest")}
      />
    </Helmet>
  );
}
