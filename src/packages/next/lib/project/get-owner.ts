import getPool from "@cocalc/database/pool";

type Users = { [account_id: string]: { group?: string } };

async function getProjectUsers(project_id: string): Promise<Users> {
  const pool = getPool("minutes");
  const result = await pool.query(
    "SELECT users FROM projects WHERE project_id=$1",
    [project_id],
  );
  if (result.rows.length === 0) {
    throw Error(`no project with id ${project_id}`);
  }
  const { users } = result.rows[0] ?? {};
  return users ?? {};
}

function collectOwnerIds(users: Users): string[] {
  const owners: string[] = [];
  for (const account_id in users) {
    if (users[account_id]?.group === "owner") {
      owners.push(account_id);
    }
  }
  return owners;
}

// Returns account_id or organization_id of the first owner found for this project.
// NOTE: Projects may have multiple owners; use getOwners() to get all owners.
export default async function getOwner(project_id: string): Promise<string> {
  const owners = await getOwners(project_id);
  return owners[0];
}

// Returns all account_ids of owners for this project.
export async function getOwners(project_id: string): Promise<string[]> {
  const owners = collectOwnerIds(await getProjectUsers(project_id));
  if (owners.length === 0) {
    throw Error(`project ${project_id} has no owner`);
  }
  return owners;
}
