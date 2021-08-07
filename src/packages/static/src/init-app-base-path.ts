import { join } from "path";
import { appBasePath } from "@cocalc/frontend/customize/app-base-path";

/* Declare to Typescript that window has an extra app_base_path
   string attribute that is defined. */

declare global {
  interface Window {
    app_base_path: string;
  }
}
window.app_base_path = appBasePath;

// See https://webpack.js.org/guides/public-path/
// and it's pretty cool this is supported!!
declare var __webpack_public_path__: any;
__webpack_public_path__ = join(appBasePath, "static/");
