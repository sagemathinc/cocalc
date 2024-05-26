import type { ComputeServerUserInfo } from "@cocalc/util/db-schema/compute-servers";
import { SCHEMA } from "@cocalc/util/db-schema";
import { getPool, stripNullFields } from "@cocalc/database";
import { isValidUUID } from "@cocalc/util/misc";
import isCollaborator from "@cocalc/server/projects/is-collaborator";

interface Options {
  account_id: string; // user making the request
  id?: number; // id of the compute server
  project_id?: string;
}

const FIELDS = Object.keys(
  SCHEMA.compute_servers.user_query?.get?.fields ?? {},
);

// Get all compute servers associated to a given project or account
export default async function getServers({
  account_id,
  id,
  project_id,
}: Options): Promise<ComputeServerUserInfo[]> {
  if (!(await isValidUUID(account_id))) {
    throw Error("account_id is not a valid uuid");
  }
  let query = `SELECT ${FIELDS.join(",")} FROM compute_servers`;
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

export async function getServer({
  account_id,
  id,
}): Promise<ComputeServerUserInfo> {
  const x = await getServers({ account_id, id });
  if (x.length != 1) {
    const server = await getServerNoCheck(id);
    if (server.configuration?.allowCollaboratorControl) {
      if (
        !(await isCollaborator({ project_id: server.project_id, account_id }))
      ) {
        throw Error("user must be collaborator on project");
      }
      return server;
    }
    throw Error("permission denied");
  }
  return x[0];
}

export async function getServerNoCheck(
  id: number,
): Promise<ComputeServerUserInfo> {
  const { rows } = await getPool().query(
    `SELECT ${FIELDS.join(",")} FROM compute_servers WHERE id=$1`,
    [id],
  );
  if (rows.length == 0) {
    throw Error(`no server with id=${id}`);
  }
  return rows[0];
}

export async function getTitle({
  account_id,
  id,
}): Promise<{ title: string; color: string }> {
  if (id == 0) {
    return { title: "The Project", color: "#666" };
  }
  const { rows } = await getPool().query(
    "SELECT title, color, project_id, account_id FROM compute_servers WHERE id=$1",
    [id],
  );
  if (rows.length == 0) {
    throw Error(`no server with id=${id}`);
  }
  if (rows[0].account_id != account_id) {
    if (
      !(await isCollaborator({ project_id: rows[0].project_id, account_id }))
    ) {
      throw Error("user must be collaborator on project");
    }
  }
  return { title: rows[0].title ?? "", color: rows[0].color ?? "" };
}
