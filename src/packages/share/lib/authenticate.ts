/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Authentication.
*/

import type { Request, Response } from "express";
import basicAuth from "basic-auth";
import { verify } from "password-hash";
import { isArray } from "lodash";
import { getLogger } from "@cocalc/util-node/logger";
import { VirtualHostInfo, Auth } from "./get-vhost-info";
const dbg = getLogger("virtual-hosts:authenticate");

interface Options {
  req: Request;
  res: Response;
  path: string;
  auth?: VirtualHostInfo;
}

export default function isAuthenticated({
  req,
  res,
  path,
  auth,
}: Options): boolean {
  if (auth == null) {
    return true; // no authentication needed
  }

  // strip any /'s from beginning of path  (auth path's are assumed relative)
  while (path[0] === "/") {
    path = path.slice(1);
  }

  let authInfo: Auth[] | undefined = undefined;
  for (const p in auth) {
    if (path.startsWith(p)) {
      authInfo = auth[p];
      break;
    }
  }

  if (authInfo == null) {
    // don't need auth for this path
    return true;
  }

  if (!isArray(authInfo)) {
    // do a double check...
    res.statusCode = 401;
    res.end(
      "auth is misconfigured  -- invalid auth field in the public_paths database."
    );
    return false;
  }

  const credentials = basicAuth(req);
  let fail: boolean = true;
  if (credentials?.name && credentials?.pass) {
    for (const { name, pass } of authInfo) {
      if (name == credentials.name) {
        if (verify(credentials.pass, pass)) {
          fail = false;
        }
        break;
      }
    }
  }

  if (fail) {
    res.statusCode = 401;
    res.setHeader("WWW-Authenticate", 'Basic realm="cocalc.com"');
    res.end("Access denied");
    return false;
  }

  // access granted
  return true;
}
