/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Support for virtual hosts.
*/

import * as os_path from "path";

import { get_public_paths, HostInfo, PublicPaths } from "./public-paths";
import { render_static_path } from "./render-static-path";
import * as util from "./util";
import { is_authenticated } from "./authenticate";
import { Database, Logger } from "./types";
import base_path from "smc-util-node/base-path";

export async function virtual_hosts(opts: {
  database: Database;
  share_path: string;
  logger: Logger;
}): Promise<Function> {
  const dbg =
    opts.logger != null
      ? (...args) => opts.logger.debug("virtual_hosts: ", ...args)
      : (..._args) => {}; // don't log anything.

  let public_paths: PublicPaths;
  dbg("getting_public_paths");
  try {
    public_paths = await get_public_paths(opts.database);
    dbg("got_public_paths - initialized");
  } catch (err) {
    // This is fatal and should be impossible...
    throw Error(`get_public_paths - ERROR - ${err}`);
  }

  function middleware(req, res, next): void {
    let host: string | undefined;
    if (req.query.host != null) {
      // used mainly for development to fake virtual hosts, since using a real
      // one is impossible in cc-in-cc dev, since the HAproxy server sends
      // them all straight to the share server!
      host = req.query.host;
    } else {
      host =
        req.headers.host != null ? req.headers.host.toLowerCase() : undefined;
    }
    // dbg("host = ", host, 'req.url=', req.url)
    const info: HostInfo | undefined =
      host != null ? public_paths.get_vhost(host) : undefined;
    if (info == null) {
      // dbg("not a virtual host path")
      next();
      return;
    }

    // TODO:
    //   - should we bother with is_public check?
    //   - what about HTTP auth?
    let path = req.url;
    if (base_path != "/") {
      path = path.slice(base_path.length);
    }

    const is_auth: boolean = is_authenticated({
      req,
      res,
      path,
      auth: info.get("auth"),
      logger: opts.logger,
    });

    if (!is_auth) {
      dbg(
        `virtual host: not authenticated -- denying  host='${host}', path='${path}'`
      );
      return;
    }

    const dir = util.path_to_files(
      opts.share_path,
      os_path.join(info.get("project_id"), info.get("path"))
    );
    dbg(
      `is a virtual host path -- host='${host}', path='${path}', dir='${dir}'`
    );
    render_static_path({ req, res, dir, path });
  }

  return middleware;
}
