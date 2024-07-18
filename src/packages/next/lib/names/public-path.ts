/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/* Get basic information about a user or organization
from the database.  This should be enough to render
a nice "homepage" for that user or organization.
*/
import getPool from "@cocalc/database/pool";
import getProjectId from "./project";
import { getOwnerName } from "lib/names/owner";
import getProxyPublicPath, {
  shouldUseProxy,
} from "lib/share/proxy/get-public-path";
import { join } from "path";

export default async function getPublicPathId(
  owner: string,
  project: string,
  public_path: string[] // this is the entire actual path
): Promise<string> {
  if (shouldUseProxy(owner)) {
    // special case -- proxy urls...
    const { id } = await getProxyPublicPath({
      url: join(owner, project, ...public_path),
    });
    return id;
  }

  const project_id = await getProjectId(owner, project);
  const pool = getPool("long");
  const result = await pool.query(
    "SELECT id FROM public_paths WHERE LOWER(name)=$1 AND project_id=$2",
    [public_path[0]?.toLowerCase() ?? "", project_id]
  );
  if (result.rows.length > 0) {
    return result.rows[0].id;
  }
  throw Error(`no public_path ${owner}/${project}/${public_path[0]}`);
}

// Given the id of a public path, returns owner name, project name, and public_path name
// if they are all defined and nonempty. Otherwise returns undefined.
export async function getPublicPathNames(
  id: string
): Promise<
  { owner: string; project: string; public_path: string } | undefined
> {
  const pool = getPool("medium");
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
