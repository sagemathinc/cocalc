// Specify the favicon.

import { join } from "path";
import { Helmet } from "react-helmet";

import { appBasePath } from "@cocalc/frontend/customize/app-base-path";

export default function LoadFavicons() {
  return (
    <Helmet>
      <link rel="icon" href={join(appBasePath, "webapp/favicon.ico")} />
    </Helmet>
  );
}
