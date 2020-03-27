/*
Authentication.
*/

import { List, Map } from "immutable";
import * as basic_auth from "basic-auth";

import * as password_hash_library from "password-hash";

import { startswith } from "smc-util/misc2";

import { Logger } from "./types";

export function is_authenticated(opts: {
  req: any;
  res: any;
  path: string;
  auth?: Map<string, any>; // immutable.js map -- {path:[{name:[string], pass:[password-hash]}, ...], ...}
  logger?: Logger;
}): boolean {
  if (opts.auth == null) {
    return true; // no authentication needed
  }

  // strip any /'s from beginning of opts.path  (auth path's are assumed relative)
  while (opts.path[0] === "/") {
    opts.path = opts.path.slice(1);
  }

  let auth_info: any = undefined;
  opts.auth.forEach(function (info, path: string): boolean | undefined {
    if (startswith(opts.path, path)) {
      auth_info = info;
      return false;
    }
  }); // break

  if (auth_info == null) {
    // don't need auth for this path
    return true;
  }

  if (!List.isList(auth_info)) {
    opts.res.statusCode = 401;
    opts.res.end(
      "auth is misconfigured  -- invalid auth field in the public_paths database."
    );
    return false;
  }

  const credentials = basic_auth(opts.req);
  let fail = true;
  if (credentials != null && credentials.name && credentials.pass) {
    for (let i = 0; i < auth_info.size; i++) {
      const x = auth_info.get(i);
      if (x.get("name") === credentials.name) {
        if (password_hash_library.verify(credentials.pass, x.get("pass"))) {
          fail = false;
        }
        break;
      }
    }
  }

  if (fail) {
    opts.res.statusCode = 401;
    opts.res.setHeader("WWW-Authenticate", 'Basic realm="cocalc.com"');
    opts.res.end("Access denied");
    return false;
  }

  // access granted
  return true;
}
