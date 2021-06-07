// Load various scripts from the server.

import * as React from "react";
import { Helmet } from "react-helmet";

declare const BASE_URL : string;  // defined via webpack

export default function LoadFavicons() {
  return (
    <Helmet>
      <link rel="icon" href={`${BASE_URL}/webapp/favicon.ico`} />
    </Helmet>
  );
}
