/* Save other paths in # part of URL then redirect to the single page app.
   That this happened is assumed, e.g., in packages/static/src/init-app-base-path.ts

   This redirect is *undone* in @cocalc/frontend/client/handle-hash-url.ts
*/

import { join } from "path";
import { Router } from "express";
import basePath from "@cocalc/backend/base-path";
import { getLogger } from "@cocalc/hub/logger";
import { APP_ROUTES } from "@cocalc/util/routing/app";

export default function init(router: Router) {
  const winston = getLogger("app-redirect");
  const v: string[] = [];
  for (const path of APP_ROUTES) {
    v.push(`/${path}/*splat`);
  }
  router.get(v, (req, res) => {
    winston.debug(req.url);
    const url = new URL("http://host");
    url.searchParams.set("target", req.url);
    res.redirect(join(basePath, "static/app.html") + url.search);
  });
}
