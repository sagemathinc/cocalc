import { join } from "path";
import { NextFunction, Request, Response } from "express";
import { getLogger } from "@cocalc/hub/logger";
import { splitFirst } from "@cocalc/util/misc";

// Redirects for backward compatibility with the old share server.
const sha1re = new RegExp(/\b([a-f0-9]{40})\b/);

export default function redirect(basePath: string) {
  const winston = getLogger("share-redirect");
  const users = join(basePath, "users/");
  const accounts = join(basePath, "accounts/");
  winston.info("creating share server legacy redirect", { users, accounts });
  return (req: Request, res: Response, next: NextFunction) => {
    /*
   The mapping:

    /users --> /accounts
    /{share sha1 hash}/the/path --> /public_paths/{share sha1 hash}/path
    /{share sha1 hash}/the/path?viewer='share' --> /public_paths/{share sha1 hash}/path
    /{share sha1 hash}/the/path?viewer='embed' --> /public_paths/embed/{share sha1 hash}/path
    /{share sha1 hash}/the/path?viewer='raw' --> /raw/{share sha1 hash}/the/path
    /{share sha1 hash}/the/path?viewer='download' --> /download/{share sha1 hash}/the/path

   Note that raw and download need the whole path in order to determine the MIME
   type of the file being downloaded in general. This is because "the/path" could
   be a *single* filename (when a user shares a single file, instead of a folder),
   in which case "/path" is empty.  (This is like gists versus github repos.)
   */
    const { url } = req;
    if (url.startsWith(users)) {
      winston.debug("/users redirect", url);
      res.redirect(301, accounts + url.slice(users.length));
      return;
    }
    // Next check if url starts with basePath/{sha1hash}/
    // We first do quick check for a slash in the position
    // it would be in if it were basePath/{sha1hash}/.
    // No valid new url has a slash there, so there is a very
    // fast check, so that the slower regexp check below only
    // happsens when a redirect is very likely.
    const i = basePath.length + 41;
    if (url[i] != "/") {
      next();
      return;
    }
    const m = url.match(sha1re);
    if (m == null || m.index != basePath.length + 1) {
      next();
      return;
    }
    const sha1hash = m[0];
    // the 'http://' is so it is an actual url; we don't use it.
    const u = new URL("http://" + url);
    let page = u.searchParams.get("viewer") ?? "public_paths";
    if (!page || page == "share") {
      page = "public_paths";
    } else if (page == "embed") {
      page = "public_paths/embed";
    }
    const [the_path] = splitFirst(url.slice(basePath.length + 42), "?");
    const path =
      page == "raw" || page == "download"
        ? the_path
        : splitFirst(the_path, "/")[1];
    const dest = join(basePath, `${page}/${sha1hash}${path ? "/" + path : ""}`);
    winston.debug("/sha1 share redirect ", url, " --> ", dest);
    res.redirect(301, dest);
  };
}
