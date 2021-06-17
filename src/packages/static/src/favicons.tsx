// Specify the favicion.

import * as React from "react";
import { Helmet } from "react-helmet";
import { join } from "path";

declare const BASE_PATH: string; // defined via webpack

export default function LoadFavicons() {
  return (
    <Helmet>
      <link rel="icon" href={join(BASE_PATH, "webapp/favicon.ico")} />
    </Helmet>
  );
}
