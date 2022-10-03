import getPool from "@cocalc/database/pool";
import { isValidUUID } from "@cocalc/util/misc";

export default async function getProxyProjectId(): Promise<string> {
  const pool = getPool("long");
  const { rows } = await pool.query(
    "SELECT value FROM server_settings WHERE name='github_project_id'"
  );
  if (rows.length == 0 || !isValidUUID(rows[0].value)) {
    throw Error("github_project_id is not configured");
  }
  return rows[0].value;
}
