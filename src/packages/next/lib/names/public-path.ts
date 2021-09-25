/* Get basic information about a user or organization
from the database.  This should be enough to render
a nice "homepage" for that user or organization.
*/
import LRU from "lru-cache";
import { reuseInFlight } from "async-await-utils/hof";

import getPool from "@cocalc/util-node/database";
import getProjectId from "./project";

// To avoid overfetching, we cache results for *a few seconds*.
const cache = new LRU<string, string>({ maxAge: 1000 * 15, max: 10000 });

export default async function getPublicPathId(
  owner: string,
  project: string,
  public_path: string
): Promise<string> {
  const key = owner + "|" + project + "|" + public_path; // | is not allowed in valid owner or project strings.
  if (cache.has(key)) {
    return cache.get(key);
  }
  const x = await getPublicPathIdNoCache(owner, project, public_path);
  cache.set(key, x);
  return x;
}

const getPublicPathIdNoCache = reuseInFlight(
  async (owner: string, project: string, public_path: string) => {
    const project_id = await getProjectId(owner, project);
    const pool = getPool();
    const result = await pool.query(
      "SELECT id FROM public_paths WHERE LOWER(name)=$1 AND project_id=$2",
      [public_path.toLowerCase(), project_id]
    );
    if (result.rows.length > 0) {
      return result.rows[0].id;
    }
    throw Error(`no public_path ${owner}/${project}/${public_path}`);
  }
);
