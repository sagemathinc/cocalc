// Load the stylesheets from our CDN. These are used in the initial page load.

import * as React from "react";

// Library that lets you add to the HEAD of the html document.
// This is important since css like bootstrap.min.css **must** get
// loaded first in the head before our main css is loaded, since
// then our main css can override bootstrap.
import { Helmet } from "react-helmet";

function linkHref(name: string, file: string): string {
  return `${BASE_URL}/res/${name}-${RES_VERSIONS[name]}/${file}`;
}

export default function Stylesheets() {
  return (
    <Helmet>
      <link
        rel="stylesheet"
        href={linkHref("bootstrap", "bootstrap.min.css")}
      />
      <link rel="stylesheet" href={linkHref("katex", "katex.min.css")} />
      <link
        rel="stylesheet"
        href={linkHref("fontawesome-free", "css/all.min.css")}
      />
    </Helmet>
  );
}
