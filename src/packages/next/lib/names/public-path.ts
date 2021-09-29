/* Get basic information about a user or organization
from the database.  This should be enough to render
a nice "homepage" for that user or organization.
*/
import LRU from "lru-cache";
import { reuseInFlight } from "async-await-utils/hof";

import getPool from "@cocalc/util-node/database";
import getProjectId from "./project";
import { getOwnerName } from "lib/names/owner";

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

// Given the id of a public path, returns owner name, project name, and public_path name
// if they are all defined and nonempty. Otherwise returns undefined.
export async function getPublicPathNames(
  id: string
): Promise<
  { owner: string; project: string; public_path: string } | undefined
> {
  const pool = getPool();
  let result = await pool.query(
    "SELECT project_id, name FROM public_paths WHERE id=$1",
    [id]
  );
  if (result.rows.length == 0) return;
  const { project_id, name: public_path } = result.rows[0];
  if (!public_path) return;

  // Having to get users is pretty stupid -- see comment in lib/project/get-owner.ts
  result = await pool.query(
    "SELECT name, users FROM projects WHERE project_id=$1 AND name IS NOT NULL AND name != ''",
    [project_id]
  );
  if (result.rows.length == 0) return;

  const { name: project, users } = result.rows[0];
  let owner_id: string = "";
  for (const account_id in users) {
    if (users[account_id].group == "owner") {
      owner_id = account_id;
      break;
    }
  }
  if (!owner_id) return; // shouldn't be possible
  const owner = await getOwnerName(owner_id);
  if (!owner) return;
  return { owner, project, public_path };
}
