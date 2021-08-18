/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Support for virtual hosts.
*/

import type { Request, Response } from "express";
import { getLogger } from "@cocalc/util-node/logger";
import pathToFiles from "lib/path-to-files";
import { basePath } from "lib/customize";
import isAuthenticated from "./authenticate";
import getVirtualHostInfo from "lib/get-vhost-info";
import { staticHandler } from "lib/handle-raw";

const logger = getLogger("virtual-hosts");

export default async function virtualHostsMiddleware(
  req: Request,
  res: Response,
  next: Function
): Promise<void> {
  // For debugging in cc-in-cc dev, just manually set host to something
  // else and comment this out.  That's the only way, since dev is otherwise
  // impossible because otherwise the haproxy server sends queries
  // all straight to the production share server!
  const vhost: string | undefined = req.headers.host?.toLowerCase();
  if (vhost == null) {
    next();
    return;
  }

  logger.debug("vhost = %s, req.url=%s", vhost, req.url);
  const info = await getVirtualHostInfo(vhost);
  if (info == null) {
    next();
    return;
  }

  let path = req.url;
  if (basePath != "/") {
    // This is pretty much only going to happen in case of doing
    // cc-in-cc dev.
    path = path.slice(basePath.length);
  }

  const isAuth: boolean = isAuthenticated({
    req,
    res,
    path,
    auth: info.auth,
  });

  if (!isAuth) {
    logger.debug(
      "not authenticated -- denying vhost='%s', path='%s'",
      vhost,
      path
    );
    res.status(403).send({ auth: false, message: "not authenticated" });
    return;
  }

  const dir = pathToFiles(info.project_id, info.path);
  logger.debug(
    "virtual host path -- vhost='%s', path='%s', dir='%s'",
    vhost,
    path,
    dir
  );

  staticHandler(dir, req, res, next);
}
