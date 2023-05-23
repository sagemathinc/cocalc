import getPool from "@cocalc/database/pool";
import { is_valid_uuid_string as isValid } from "@cocalc/util/misc";

interface Options {
  account_id: string;
  project_id: string;
}

export default async function isCollaborator({
  account_id,
  project_id,
}: Options): Promise<boolean> {
  if (!isValid(account_id) || !isValid(project_id)) {
    throw Error("invalid input");
  }
  if (account_id == project_id) {
    // Special case: when using the project_id the client's account
    // *is* the project, so their id is the project_id.  They have
    // proved they are the project, so that's this case.  Note that
    // if there were a project that randomly had the same uuid as a
    // user, then that use would also get access to that project,
    // but that is highly unlikely (and mostly useless).
    return true;
  }
  const pool = getPool("long"); // fine to cache "yes, you're a collab" for a while
  const { rows } = await pool.query(
    `SELECT users#>'{${account_id},group}' AS group FROM projects WHERE project_id=\$1`,
    [project_id]
  );
  const group = rows[0]?.group;
  return group == "owner" || group == "collaborator";
}
