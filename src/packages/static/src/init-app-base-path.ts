/* Declare to Typescript that window has an extra app_base_path
   string attribute that is defined. */

import { join } from "path";

declare global {
  interface Window {
    app_base_path: string;
  }
}

const { pathname } = window.location;
console.log("pathname = ", pathname);
let i = pathname.lastIndexOf("/static");
if (i != -1) {
  window.app_base_path = i == 0 ? "/" : pathname.slice(0, i);
} else {
  // This is a fallback that *should* never happen, since the hub
  // should redirect everything to /static/app.html.
  window.app_base_path = "/";
}

// See https://webpack.js.org/guides/public-path/
// and it's pretty cool this is supported!!
declare var __webpack_public_path__: any;
__webpack_public_path__ = join(window.app_base_path, "static/");
