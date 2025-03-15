import getPool from "@cocalc/database/pool";
import { is_valid_uuid_string as isValid } from "@cocalc/util/misc";

interface Options {
  account_id: string;
  project_id: string;
}

// Return true if account_id is a collaborator on project_ids.
export default async function isCollaborator({
  account_id,
  project_id,
}: Options): Promise<boolean> {
  if (!isValid(account_id) || !isValid(project_id)) {
    throw Error("invalid account_id or project_id -- all must be valid uuid's");
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
    `SELECT users#>'{${account_id},group}' AS group FROM projects WHERE project_id=$1`,
    [project_id],
  );
  const group = rows[0]?.group;
  return group == "owner" || group == "collaborator";
}

// Return true if account_id is a collaborator on EVERY project in project_ids
export async function isCollaboratorMulti({
  account_id,
  project_ids,
}: {
  account_id: string;
  project_ids: string[];
}): Promise<boolean> {
  if (!isValid(account_id)) {
    throw Error("invalid account_id");
  }
  for (const project_id of project_ids) {
    if (!isValid(project_id)) {
      throw Error("all project_id's must be valid uuids");
    }
  }
  const pool = getPool("long");
  const { rows } = await pool.query(
    `SELECT users#>'{${account_id},group}' AS group FROM projects WHERE project_id=ANY($1)`,
    [project_ids],
  );
  for (const { group } of rows) {
    if (group != "owner" && group != "collaborator") {
      return false;
    }
  }
  return true;
}

// return which projects account_id is a collab on
export async function subsetCollaboratorMulti({
  account_id,
  project_ids,
}: {
  account_id: string;
  project_ids: string[];
}): Promise<string[]> {
  if (!isValid(account_id)) {
    throw Error("invalid account_id");
  }
  for (const project_id of project_ids) {
    if (!isValid(project_id)) {
      throw Error("all project_id's must be valid uuids");
    }
  }
  const pool = getPool("long");
  const { rows } = await pool.query(
    `SELECT project_id, users#>'{${account_id},group}' AS group FROM projects WHERE project_id=ANY($1)`,
    [project_ids],
  );
  const collab: string[] = [];
  for (const { group, project_id } of rows) {
    if (group == "owner" || group == "collaborator") {
      collab.push(project_id);
    }
  }
  return collab;
}
