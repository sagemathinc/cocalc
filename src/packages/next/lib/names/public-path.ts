/* Get basic information about a user or organization
from the database.  This should be enough to render
a nice "homepage" for that user or organization.
*/

import getPool from "@cocalc/util-node/database";
import getProjectId from "./project";

export default async function getPublicPathId(
  owner: string,
  project: string,
  public_path: string
): Promise<string> {
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
