// Load the stylesheets from our CDN. These are used in the initial page load.

import * as React from "react";

// Library that lets you add to the HEAD of the html document.
// This is important since css like bootstrap.min.css **must** get
// loaded first in the head before our main css is loaded, since
// then our main css can override bootstrap.
import { Helmet } from "react-helmet";

export default function LoadScripts() {
  return (
    <Helmet>
      <script src={`${BASE_URL}/customize?type=full`} type="text/javascript" />
    </Helmet>
  );
}
