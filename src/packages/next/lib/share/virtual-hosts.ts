/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Support for virtual hosts.
*/

import type { Request, Response } from "express";
import { getLogger } from "@cocalc/util-node/logger";
import pathToFiles from "./path-to-files";
import isAuthenticated from "./authenticate";
import getVirtualHostInfo from "./get-vhost-info";
import { staticHandler } from "./handle-raw";
import basePath from "@cocalc/util-node/base-path";

const logger = getLogger("virtual-hosts");

export default function virtualHostsMiddleware() {
  // we return the middleware to match the standard pattern for express,
  // and give more flexibility.
  return async function (
    req: Request,
    res: Response,
    next: Function
  ): Promise<void> {
    // For debugging in cc-in-cc dev, just manually set host to something
    // else and comment this out.  That's the only way, since dev is otherwise
    // impossible because otherwise the haproxy server sends queries
    // all straight to the production share server!
    const vhost: string | undefined = req.headers.host?.toLowerCase();
    //const vhost = "vertramp.org";
    if (vhost == null) {
      // logger.debug("no host header set");
      next();
      return;
    }
    logger.debug("checking for vhost", vhost);

    const info = await getVirtualHostInfo(vhost);
    if (info == null) {
      // logger.debug("no vhost info for ", vhost);
      next();
      return;
    }

    let path = req.url;
    if (basePath && basePath != "/") {
      // This is only going to happen in case of doing
      // cc-in-cc development.
      path = req.url.slice(basePath.length);
    }
    if (path == "") {
      path = "/";
    }

    // logger.debug({ vhost, url: req.url, info, path });

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
      res.status(403).end();
      return;
    }

    const dir = pathToFiles(info.project_id, info.path);
    /* logger.debug(
      "serving virtual host path -- vhost='%s',dir='%s'",
      vhost,
      dir
    ); */
    req.url = path;
    staticHandler(dir, req, res, () => {
      res.status(404).end();
    });
  };
}
