// Specify the favicion.

import { Helmet } from "react-helmet";
import { join } from "path";
import { appBasePath } from "@cocalc/frontend/customize/app-base-path";

export default function LoadFavicons() {
  return (
    <Helmet>
      <link
        rel="icon"
        href={join(appBasePath, "webapp/favicon.ico")}
      />
    </Helmet>
  );
}
