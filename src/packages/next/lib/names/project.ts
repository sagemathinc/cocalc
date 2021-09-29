/* Get basic information about a user or organization
from the database.  This should be enough to render
a nice "homepage" for that user or organization.
*/

import LRU from "lru-cache";
import { reuseInFlight } from "async-await-utils/hof";
import getPool from "@cocalc/util-node/database";
import getOwner from "./owner";

// To avoid overfetching, we cache results for *a few seconds*.
const cache = new LRU<string, string>({ maxAge: 1000 * 15, max: 10000 });

// Throws an exception if there is no project with this name.
// TODO: take into account redirects for when name is changed.

export default async function getProjectId(
  owner: string,
  project: string
): Promise<string> {
  const key = owner + "|" + project; // | is not allowed in valid owner or project strings.
  if (cache.has(key)) {
    return cache.get(key);
  }
  const x = await getProjectIdNoCache(owner, project);
  cache.set(key, x);
  return x;
}

// Also, if multiple requests at about the same time, only make one to the db.
const getProjectIdNoCache = reuseInFlight(
  async (owner: string, project: string) => {
    const { owner_id } = await getOwner(owner);
    const pool = getPool();

    // NOTE: it's not enough that owner is a collab on the project -- they have to be the owner.
    // We do users ? $2 also, since it's fast/indexed, then dig in to the JSON...
    // Note that we have put owner_id in the query string explicitly (as far as I know),
    // though it is NOT user supplied so that's safe.
    const result = await pool.query(
      `SELECT project_id FROM projects WHERE LOWER(name)=$1 AND users ? $2 AND users#>>'{${owner_id},group}' = 'owner'`,
      [project.toLowerCase(), owner_id]
    );
    if (result.rows.length > 0) {
      return result.rows[0].project_id;
    }
    throw Error(`no project ${owner}/${project}`);
  }
);
