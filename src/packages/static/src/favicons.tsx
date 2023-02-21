// Specify the favicon.

import { Helmet } from "react-helmet";
import { join } from "path";
import { appBasePath } from "@cocalc/frontend/customize/app-base-path";
import useCustomize from "./customize";

export default function LoadFavicons() {
  const customize = useCustomize();

  return (
    <Helmet>
      <link
        rel="icon"
        href={
          customize.logo_square
            ? customize.logo_square
            : join(appBasePath, "webapp/favicon.ico")
        }
      />
    </Helmet>
  );
}
