import type { ComputeServer } from "@cocalc/util/db-schema/compute-servers";
import { getPool, stripNullFields } from "@cocalc/database";
import { isValidUUID } from "@cocalc/util/misc";
import isCollaborator from "@cocalc/server/projects/is-collaborator";

interface Options {
  account_id: string; // user making the request
  id?: number; // id of the compute server
  project_id?: string;
  created_by?: boolean;
  started_by?: boolean;
}

// Get all compute servers associated to a given project
export default async function getServers({
  account_id,
  id,
  project_id,
  created_by,
  started_by,
}: Options): Promise<ComputeServer[]> {
  if (!(await isValidUUID(account_id))) {
    throw Error("account_id is not a valid uuid");
  }
  if (!project_id && !created_by && !started_by && !id) {
    // get all compute servers across all projects that account_id is a collaborator on.
    return await getAllServers(account_id);
  }

  let query = "SELECT * FROM compute_servers";
  const params: (string | number)[] = [];
  const where: string[] = [];
  let n = 1;
  if (id != null) {
    where.push(`id=$${n}`);
    params.push(id);
    n += 1;
  }
  if (project_id) {
    if (!(await isCollaborator({ project_id, account_id }))) {
      throw Error("user must be collaborator on project");
    }
    where.push(`project_id=$${n}`);
    params.push(project_id);
    n += 1;
  }
  if (created_by) {
    where.push(`created_by=$${n}`);
    params.push(account_id);
    n += 1;
  }
  if (started_by) {
    where.push(`started_by=$${n}`);
    params.push(account_id);
    n += 1;
  }
  if (where.length == 0) {
    throw Error("bug");
  }
  const pool = getPool();
  query = `${query} WHERE ${where.join(" AND ")}`;
  const { rows } = await pool.query(query, params);
  if (id != null && !project_id) {
    // We grabbed a compute server by its id, and the project_id was not
    // specified, so user has to be collab on project to get this result back,
    // so we check that.
    if (
      !(await isCollaborator({ project_id: rows[0]?.project_id, account_id }))
    ) {
      throw Error(
        "user must be collaborator on project to get compute server with given id",
      );
    }
  }
  return stripNullFields(rows);
}

async function getAllServers(account_id: string): Promise<ComputeServer[]> {
  const pool = getPool();
  const { rows } = await pool.query(
    `
SELECT compute_servers.* FROM compute_servers INNER JOIN
projects ON compute_servers.project_id = projects.project_id WHERE
projects.DELETED IS NOT true AND projects.users ? $1`,
    [account_id],
  );
  return stripNullFields(rows);
}
