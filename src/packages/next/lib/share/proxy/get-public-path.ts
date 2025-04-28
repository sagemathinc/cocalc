/*
Supported proxy schema should be mostly consistent with (and an extension of) nbviewer.org:

`url/example.com/thingy...` or `gist/user/id` or `github/owner/repo...`, etc.

Three options handled right now; anything else is an error.  The path must uniquely determine
what is publicly shared (at some unit), and it's nice if it is useful (e.g., for url's and gists).

- github/cocalc/sagemathinc/... --> 'github/cocalc/sagemathinc'; i.e., the github repo maps 1:1 to cocalc public path.
- gist/darribas/4121857 --> 'gist/4121857/guardian_gaza.ipynb'; here guardian_gaza.ipynb is the first filename hosted
  in the gist, and requires api call to github to get it. This uniquely determines the gist *and* tells us what type of file
  it contains so we can render it.
- url/wstein.org/Tables/modjac/curves.txt --> 'url/wstein.org/Tables/modjac/curves.txt'; path equals the url, since this is
  completely generic and there is nothing further we could do.

*/

import getProxyProjectId from "lib/share/proxy/project";
import getPool from "@cocalc/database/pool";
import { sha1 } from "@cocalc/util/misc";
import { fileInGist } from "./api";

export function shouldUseProxy(owner: string): boolean {
  return owner == "github" || owner == "gist";
}

const QUERY = `SELECT id, project_id, path, url, description, counter::INT, last_edited,
    (SELECT COUNT(*)::INT FROM public_path_stars WHERE public_path_id=id) AS stars
    FROM public_paths WHERE `;

export default async function getProxyPublicPath({
  id,
  project_id,
  path,
  url,
  description,
}: {
  id?: string;
  url?: string;
  project_id?: string;
  path?: string;
  description?: string;
}): Promise<{
  id: string;
  project_id: string;
  path: string;
  url: string;
  counter?: number;
  stars: number;
  last_edited: Date;
  description?: string;
}> {
  const pool = getPool("short");
  if (id != null) {
    // id is given, so return public_path with that id, if there is one.
    const { rows } = await pool.query(QUERY + " id = $1", [id]);
    if (rows.length > 0) {
      return rows[0];
    }
  }
  if (url != null) {
    // url is given, so return public_path with that url, if already known.
    const { rows } = await pool.query(QUERY + " url = $1", [url]);
    if (rows.length > 0) {
      return rows[0];
    }
  }
  if (project_id == null) {
    // this is the unique project used for all url proxying functionality; if not given,
    // we just look it up for convenience.
    project_id = await getProxyProjectId();
  }
  if (id == null && path != null) {
    // if id not given but path is, then we can compute the id from project_id and path, since it's derived from them.
    id = sha1(project_id + path);
    // try based on the id, which we now know:
    const { rows } = await pool.query(QUERY + " id = $1", [id]);
    if (rows.length > 0) {
      return rows[0];
    }
  }

  // We need to create this public_path and return that.
  if (!url) {
    // There is no possible way to create a public_path associated to
    // proxying a URL without knowing the URL.
    throw Error("url must be specified in order to create public_path");
  }
  // We can assume url is known.
  if (path == null) {
    path = await getPath(url);
  }

  if (id == null) {
    id = sha1(project_id + path);
  }
  if (id == null) throw Error("bug"); // not possible.

  // It could still be that the path with this id is in the database.
  // Example is gist/4121857 and gist/darribas/4121857 resolve to same record,
  // but initial search for 'gist/4121857' does not find anything.
  // id is given, so return public_path with that id, if there is one.
  const { rows } = await pool.query(QUERY + " id = $1", [id]);
  if (rows.length > 0) {
    return rows[0];
  }

  let publicPathUrl;
  if (url.startsWith("github/")) {
    // URL to the repository, not the exact path being requested.
    publicPathUrl = url.split("/").slice(0, 3).join("/");
  } else {
    publicPathUrl = url;
  }

  const now = new Date();
  await pool.query(
    "INSERT INTO public_paths (id, url, project_id, path, description, last_edited, last_saved, created) VALUES($1, $2, $3, $4, $5, $6, $7, $8)",
    [id, publicPathUrl, project_id, path, description, now, now, now],
  );
  return {
    id,
    url,
    project_id,
    path,
    description,
    last_edited: now,
    counter: 0,
    stars: 0,
  };
}

async function getPath(url: string) {
  if (url.startsWith("github/")) {
    const v = url.split("/");
    if (v.length < 3) {
      throw Error(`invalid url - ${url} - must at least specify repo`);
    }
    return v.slice(0, 3).join("/");
  }
  if (url.startsWith("url/")) {
    return url;
  }
  if (url.startsWith("gist/")) {
    const v = url.split("/");
    return await fileInGist(v.length >= 3 ? v[2] : v[1]);
  }
  throw Error(`unknown proxy url schema -- ${url}`);
}
