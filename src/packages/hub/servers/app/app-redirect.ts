/* Save other paths in # part of URL then redirect to the single page app.
   That this happened is assumed, e.g., in packages/static/src/init-app-base-path.ts

   This redirect is *undone* in @cocalc/frontend/client/handle-hash-url.ts
*/

import { join } from "path";
import { Router } from "express";
import basePath from "@cocalc/backend/base-path";
import { getLogger } from "@cocalc/hub/logger";

// All top level page "entry points" in the webapp must be listed here.
// Should be consistent with what is handled in @cocalc/frontend/history.ts
// and @cocalc/frontend/app/actions.ts
const ROUTES = ["admin", "projects", "settings", "notifications"];

export default function init(router: Router) {
  const winston = getLogger("app-redirect");
  const v: string[] = [];
  for (const path of ROUTES) {
    v.push(`/${path}*`);
  }
  router.get(v, (req, res) => {
    winston.debug(req.url);
    const url = new URL("http://host");
    url.searchParams.set("target", req.url);
    res.redirect(join(basePath, "static/app.html") + url.search);
  });
}
