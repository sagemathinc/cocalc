/* Declare to Typescript that window has an extra app_base_path
   string attribute that is defined. */

import { join } from "path";
import { setAppBasePath } from "@cocalc/frontend/customize/app-base-path";

declare global {
  interface Window {
    app_base_path: string;
  }
}

const { pathname } = window.location;
let i = pathname.lastIndexOf("/static");

let appBasePath : string;
if (i != -1) {
  appBasePath = i == 0 ? "/" : pathname.slice(0, i);
} else {
  // This is a fallback that *should* never happen, since the hub
  // should redirect everything to /static/app.html.
  appBasePath = "/";
}

// See https://webpack.js.org/guides/public-path/
// and it's pretty cool this is supported!!
declare var __webpack_public_path__: any;
__webpack_public_path__ = join(appBasePath, "static/");

setAppBasePath(appBasePath);
