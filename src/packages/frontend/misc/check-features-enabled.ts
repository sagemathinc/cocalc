/*
Check that required minimum functionality is enabled, and if not shows
a big red warning.  In particular, checks for:

- local storage
- cookies
*/

import { has_local_storage } from "@cocalc/util/misc";
import { redux } from "@cocalc/frontend/app-framework";
import { delay } from "awaiting";

export default async function checkFeaturesEnabled() {
  if (navigator == undefined) {
    // backend/
    return;
  }
  await delay(2000);
  let page: any = undefined;
  while (true) {
    page = redux.getActions("page");
    if (page != null) break;
    // It's fine to wait until page has loaded and then some before showing a warning
    // to the user.  This is also necessary to ensure the page actions/store have been defined.
    await delay(2000);
  }

  // Check for cookies (see http://stackoverflow.com/questions/6125330/javascript-navigator-cookieenabled-browser-compatibility)
  if (!navigator.cookieEnabled) {
    page.show_cookie_warning();
  }

  // Check for local storage
  if (!has_local_storage()) {
    page.show_local_storage_warning();
  }
}
