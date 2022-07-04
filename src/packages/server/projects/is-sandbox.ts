import getPool from "@cocalc/database/pool";
import { is_valid_uuid_string as isValid } from "@cocalc/util/misc";

export default async function isSandbox(project_id: string): Promise<boolean> {
  if (!isValid(project_id)) {
    throw Error("invalid project_id");
  }
  const pool = getPool("long"); // fine to cache "yes, you're a sandbox project" for a few seconds is fine.
  const { rows } = await pool.query(
    `SELECT sandbox FROM projects WHERE project_id=\$1`,
    [project_id]
  );
  return !!rows[0]?.sandbox;
}
