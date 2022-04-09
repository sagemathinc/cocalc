/* get up to limit projects that have the given user as a collaborator,
   ordered by how recently they were modified.

   DELETED and HIDDEN projects are skipped.
*/

import getPool from "@cocalc/database/pool";
import { is_valid_uuid_string as isValidUUID } from "@cocalc/util/misc";

// I may add more fields and more options later...
export default async function getProjects({
  account_id,
  limit = 50,
}: {
  account_id: string;
  limit?: number;
}): Promise<{ project_id: string; title?: string; description?: string }[]> {
  if (!isValidUUID(account_id)) {
    throw Error("account_id must be a UUIDv4");
  }
  if (limit <= 0) {
    return [];
  }
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT project_id, title, description FROM projects WHERE DELETED IS NOT true AND users ? $1 AND (users#>>'{${account_id},hide}')::BOOLEAN IS NOT TRUE ORDER BY last_edited DESC LIMIT $2`,
    [account_id, limit]
  );
  return rows;
}
