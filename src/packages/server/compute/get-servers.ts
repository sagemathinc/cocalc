import type { ComputeServerUserInfo } from "@cocalc/util/db-schema/compute-servers";
import { SCHEMA } from "@cocalc/util/db-schema";
import { getPool, stripNullFields } from "@cocalc/database";
import { isValidUUID } from "@cocalc/util/misc";
import isCollaborator, {
  isCollaboratorMulti,
} from "@cocalc/server/projects/is-collaborator";
import { getProjectSpecificId } from "./project-specific-id";

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
}): Promise<{ title: string; color: string; project_specific_id: number }> {
  if (id == 0) {
    return { title: "The Project", color: "#666", project_specific_id: 0 };
  }
  const { rows } = await getPool().query(
    "SELECT title, color, project_id, account_id, project_specific_id FROM compute_servers WHERE id=$1",
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
  const { title, color, project_specific_id, project_id } = rows[0];
  return {
    title: title ?? "",
    color: color ?? "",
    project_specific_id:
      project_specific_id ?? // shouldn't be undefined, but maybe during transition before we had project_specific_id, so this handles it
      (await getProjectSpecificId({
        compute_server_id: id,
        project_id,
      })),
  };
}

export async function getServersById({
  account_id,
  ids,
  fields,
}: {
  account_id: string;
  ids: number[];
  fields?: string[];
}): Promise<Partial<ComputeServerUserInfo>[]> {
  if (!(await isValidUUID(account_id))) {
    throw Error("account_id is not a valid uuid");
  }
  if (fields == null) {
    fields = FIELDS;
  } else {
    const X = new Set(fields);
    X.add("project_id");
    fields = FIELDS.filter((field) => X.has(field));
  }
  if (fields == null) {
    throw Error("BUG");
  }
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT ${fields.join(",")} FROM compute_servers WHERE id=ANY($1)`,
    [ids],
  );
  // SECURITY: we need to confirm that account_id is a collaborator on every project_id of these rows.
  const project_ids = Array.from(
    new Set(rows.map(({ project_id }) => project_id)),
  );
  if (!(await isCollaboratorMulti({ account_id, project_ids }))) {
    throw Error(
      "user must be a collaborator on ALL projects containing the compute servers",
    );
  }
  return stripNullFields(rows);
}

