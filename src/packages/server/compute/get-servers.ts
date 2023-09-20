import type { ComputeServer } from "@cocalc/util/db-schema/compute-servers";
import { getPool, stripNullFields } from "@cocalc/database";
import { isValidUUID } from "@cocalc/util/misc";
import isCollaborator from "@cocalc/server/projects/is-collaborator";

interface Options {
  account_id: string; // user making the request
  id?: number; // id of the compute server
  project_id?: string;
}

// Get all compute servers associated to a given project
export default async function getServers({
  account_id,
  id,
  project_id,
}: Options): Promise<ComputeServer[]> {
  if (!(await isValidUUID(account_id))) {
    throw Error("account_id is not a valid uuid");
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
  } else {
    where.push(`account_id=$${n}`);
    params.push(account_id);
    n += 1;
  }
  if (where.length == 0) {
    throw Error("bug");
  }
  const pool = getPool();
  query = `${query} WHERE ${where.join(" AND ")}`;
  const { rows } = await pool.query(query, params);
  return stripNullFields(rows);
}

export async function getServer({ account_id, id }): Promise<ComputeServer> {
  const x = await getServers({ account_id, id });
  if (x.length != 1) {
    throw Error("permission denied");
  }
  return x[0];
}
