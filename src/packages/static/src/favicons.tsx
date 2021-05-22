// Load various scripts from the server.

import * as React from "react";
import { Helmet } from "react-helmet";

export default function LoadFavicons() {
  return (
    <Helmet>
      <link rel="icon" href={`${BASE_URL}/webapp/favicon.ico`} />
    </Helmet>
  );
}
