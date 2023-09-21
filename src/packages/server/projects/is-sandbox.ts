import getPool from "@cocalc/database/pool";
import { is_valid_uuid_string as isValid } from "@cocalc/util/misc";
import { getServerSettings } from "@cocalc/database/settings";

export default async function isSandbox(project_id: string): Promise<boolean> {
  if (!isValid(project_id)) {
    throw Error("invalid project_id");
  }
  const { sandbox_projects_enabled } = await getServerSettings();
  if (!sandbox_projects_enabled) {
    // If sandbox projects are not enabled, then no project is a sandbox project.
    return false;
  }
  const pool = getPool("long"); // fine to cache "yes, you're a sandbox project" for a few seconds is fine.
  const { rows } = await pool.query(
    `SELECT sandbox FROM projects WHERE project_id=\$1`,
    [project_id],
  );
  return !!rows[0]?.sandbox;
}
