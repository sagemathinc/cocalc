import getPool from "@cocalc/backend/database";

// Returns account_id or organization_id of the owner of this project.
export default async function getOwner(project_id: string): Promise<string> {
  const pool = getPool("minutes"); // we don't even have a way to change the owner ever in cocalc.

  // TODO: this seems *really* stupid/inefficient in general, e.g., what if
  // there are 1000 users?  I don't know JSONB PostgreSQL enough to come up
  // with a better query...
  const result = await pool.query(
    "SELECT users FROM projects WHERE project_id=$1",
    [project_id]
  );
  if (result.rows.length == 0) {
    throw Error(`no project with id ${project_id}`);
  }
  const { users } = result.rows[0] ?? {};
  for (const account_id in users) {
    if (users[account_id].group == "owner") {
      return account_id;
    }
  }
  throw Error(`project ${project_id} has no owner`);
}
