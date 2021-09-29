// Load the custom manifest for our site, which is necessary so that we can
// install the page as a local webapp.  It's part of being a "progressive
// web app", as was started in this PR: https://github.com/sagemathinc/cocalc/pull/5254

import { Helmet } from "react-helmet";
import { join } from "path";
import { appBasePath } from "@cocalc/frontend/customize/app-base-path";

window.addEventListener("load", async function () {
  const path = join(appBasePath, "webapp/serviceWorker.js");

  try {
    await navigator.serviceWorker.register(path, {
      scope: appBasePath,
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
        href={join(appBasePath, "customize?type=manifest")}
      />
    </Helmet>
  );
}
