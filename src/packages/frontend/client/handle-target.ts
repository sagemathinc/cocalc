/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { hasRememberMe } from "@cocalc/frontend/misc/remember-me";
import { join } from "path";
import { appBasePath } from "@cocalc/frontend/customize/app-base-path";
import { encode_path } from "@cocalc/util/misc";

export const IS_EMBEDDED = new URL(location.href).pathname.endsWith(
  "embed.html"
);

function handleTarget(): string {
  // See src/packages/hub/servers/app/app-redirect.ts where if
  // there is a path after the base url, we redirect to static/app.html
  // and put that path in a query param called 'target'.
  const u = new URL(location.href);
  let t = u.searchParams.get("target") ?? "";
  // We use the URL object and a fake host to parse things, since it's much
  // more secure/robust than parsing it directly.
  const url = new URL("http://" + join("host", t));
  let target = decodeURIComponent(url.pathname.slice(1));
  if (!target) {
    // if no target is encoded in the url:
    if (hasRememberMe(appBasePath)) {
      // probably signed in -- show user their list of projects
      target = "projects";
    } else {
      // not signed in -- show sign in page (which is currently part of "settings", which is dumb)
      target = "settings";
    }
  }
  if (!IS_EMBEDDED) {
    u.searchParams.delete("target");
    u.searchParams.forEach((val, key) => {
      url.searchParams.set(key, val);
    });
    // Write the full url for the given target, preserving any search (except target) and fragment parts of the url.
    const fullUrl =
      document.location.origin +
      join(appBasePath, encode_path(target)) +
      url.search +
      u.hash;
    history.pushState({}, "", fullUrl);
  }
  return target;
}

const target: string = handleTarget();

export default target;
