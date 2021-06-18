// Load the custom manifest for our site, which is necessary so that we can
// install the page as a local webapp.  It's part of being a "progressive
// web app", as was started in this PR: https://github.com/sagemathinc/cocalc/pull/5254

import * as React from "react";
import { Helmet } from "react-helmet";
import { join } from "path";

declare const BASE_PATH: string; // defined via webpack

export default function Primus() {
  return (
    <Helmet>
      <script
        type="text/javascript"
        src={join(BASE_PATH, "primus.min.js")}
      ></script>
    </Helmet>
  );
}
