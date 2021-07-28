// Specify the favicion.

import * as React from "react";
import { Helmet } from "react-helmet";
import { join } from "path";

export default function LoadFavicons() {
  return (
    <Helmet>
      <link
        rel="icon"
        href={join(window.app_base_path, "webapp/favicon.ico")}
      />
    </Helmet>
  );
}
