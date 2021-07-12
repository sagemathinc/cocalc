/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { hasRememberMe } from "smc-util/remember-me";
import { join } from "path";

function handleHashUrl(): string {
  // This code may get compiled by the backend project, so make it work without DOM declarations.
  try {
    if (window == null || document == null) return "";
  } catch (_err) {
    // not defined at all.
    return "";
  }

  // If there is a big path after the base url the hub moves all
  // that part of the url to after a # (see line 288 of src/smc-hub/hub_http_server.coffee).
  // This is a hack so that we can put our whole webapp at static/app.html, instead of having
  // to serve it from tons of other entry points (though that may change later).    E.g.,
  //   https://cocalc.com/45f4aab5-7698-4ac8-9f63-9fd307401ad7/port/8000/projects/f2b471ee-a300-4531-829d-472fa46c7eb7/files/2019-12-16-114812.ipynb?session=default
  // is converted to
  //   https://cocalc.com/45f4aab5-7698-4ac8-9f63-9fd307401ad7/port/8000/static/app.html#projects/f2b471ee-a300-4531-829d-472fa46c7eb7/files/2019-12-16-114812.ipynb?session=default
  const hash = decodeURIComponent(window.location.hash.slice(1));
  let target = hash;
  // the location hash could again contain a query param, hence this
  const i = target.indexOf("?");
  if (i >= 0) {
    target = target.slice(0, i);
  }
  if (!target) {
    // if no target is encoded in the url:
    if (hasRememberMe(window.app_base_path)) {
      // probably signed in -- show user their list of projects
      target = "projects";
    } else {
      // not signed in -- show sign in page (which is currently part of "settings", which is dumb)
      target = "settings";
    }
  }
  let query_params = "";
  if (i >= 0) {
    // We must also preserve the query params
    query_params = hash.slice(i + 1);
  }
  if (!hash) {
    // if there is no hash param, e.g., directly visiting static/app.html, then
    // just get the normal query params
    const j = window.location.href.indexOf("?");
    if (j != -1) {
      query_params = window.location.href.slice(j + 1);
    }
  }

  // Finally remove the hash from the url (without refreshing the page, of course).
  let full_url = document.location.origin + join(window.app_base_path, target);
  if (query_params) {
    full_url += "?" + query_params;
  }
  window.history.pushState("", "", full_url);
  return target;
}

export const target: string = handleHashUrl();
