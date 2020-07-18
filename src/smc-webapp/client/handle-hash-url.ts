/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// This code may get compiled by the backend project, so make it work without DOM declarations.
declare const window: any;
declare const document: any;

let already_handled_hash_url: boolean = false;
export function handle_hash_url(): void {
  if (window == null || document == null) return;

  // It's critial to only do this once.
  if (already_handled_hash_url) return;
  already_handled_hash_url = true;

  // If there is a big path after the base url the hub (I think) moves all
  // that part of the url to after a #.  This is a hack so that we can put
  // our whole webapp at app/ instead of having to serve it from tons
  // of other urls.    E.g.,
  //   https://cocalc.com/45f4aab5-7698-4ac8-9f63-9fd307401ad7/port/8000/projects/f2b471ee-a300-4531-829d-472fa46c7eb7/files/2019-12-16-114812.ipynb?session=default
  // is converted to
  //   https://cocalc.com/45f4aab5-7698-4ac8-9f63-9fd307401ad7/port/8000/app#projects/f2b471ee-a300-4531-829d-472fa46c7eb7/files/2019-12-16-114812.ipynb?session=default
  if (window.location.hash.length <= 1) {
    // nothing to parse.
    window.cocalc_target = "";
    return;
  }
  if (window.cocalc_target !== undefined) {
    // already did the parsing; doing something again would be confusing/bad.
    return;
  }
  const hash = decodeURIComponent(window.location.hash.slice(1));
  let cocalc_target = hash;
  // the location hash could again contain a query param, hence this
  const i = cocalc_target.indexOf("?");
  if (i >= 0) {
    cocalc_target = cocalc_target.slice(0, i);
  }
  // save this so we don't have to parse it later... (TODO: better to store in a Store somewhere?)
  window.cocalc_target = cocalc_target;
  let query_params = "";
  if (i >= 0) {
    // We must also preserve the query params
    query_params = hash.slice(i + 1);
  }

  // Finally remove the hash from the url (without refreshing the page, of course).
  let full_url = document.location.pathname;
  if (cocalc_target) {
    full_url += "/" + cocalc_target;
  }
  if (query_params) {
    full_url += "?" + query_params;
  }
  window.history.pushState("", "", full_url);
}
