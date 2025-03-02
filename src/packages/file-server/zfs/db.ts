/*
Database
*/

import Database from "better-sqlite3";
import { context, POOL_PREFIX } from "./config";
import type { Project, RawProject, SetProject } from "./types";
import { isValidUUID, is_array, is_date } from "@cocalc/util/misc";

let db: null | Database.Database;
export function getDb(): Database.Database {
  if (db == null) {
    db = new Database("projects.db");
    db.prepare(
      `CREATE TABLE IF NOT EXISTS projects (
          namespace TEXT,
          project_id TEXT,
          pool TEXT,
          archived INTEGER,
          affinity TEXT,
          nfs TEXT,
          snapshots TEXT,
          last_edited TEXT,
          last_send_snapshot TEXT,
          error TEXT,
        PRIMARY KEY (namespace, project_id)
      )`,
    ).run();
  }
  return db!;
}

function convertToSqliteType({ value, getProject }) {
  if (is_array(value)) {
    return value.join(",");
  } else if (is_date(value)) {
    return value.toISOString();
  } else if (typeof value == "boolean") {
    return value ? 1 : 0;
  } else if (typeof value == "function") {
    const x = value(getProject());
    if (typeof x == "function") {
      throw Error("function must not return a function");
    }
    // returned value needs to be converted
    return convertToSqliteType({ value: x, getProject });
  }
  return value;
}

export function set(obj: SetProject) {
  const namespace = obj.namespace ?? context.namespace;
  const project_id = obj.project_id;
  if (!isValidUUID(project_id)) {
    throw Error(`"${project_id}" must be a valid uuid`);
  }
  const fields: string[] = [];
  const values: any[] = [];
  let project: null | Project = null;
  const getProject = () => {
    if (project == null) {
      project = get({ namespace, project_id });
    }
    return project;
  };
  for (const field in obj) {
    if (field == "project_id" || field == "namespace") {
      continue;
    }
    fields.push(field);
    values.push(convertToSqliteType({ value: obj[field], getProject }));
  }
  let query = `UPDATE projects SET
    ${fields.map((field) => `${field}=?`).join(", ")}
    WHERE project_id=? AND namespace=?
  `;
  values.push(project_id);
  values.push(namespace);
  const db = getDb();
  db.prepare(query).run(...values);
}

// Call this if something that should never happen, does in fact, happen.
// It will set the error state of the project and throw the exception.
// Admins will be regularly notified of all projects in an error state.
export function fatalError({
  namespace,
  project_id,
  err,
  desc,
}: {
  namespace?: string;
  project_id: string;
  err: Error;
  desc?: string;
}) {
  set({ namespace, project_id, error: `${err}${desc ? " - " + desc : ""}` });
  throw err;
}

export function clearError({ project_id, namespace }) {
  set({ namespace, project_id, error: null });
}

export function touch(project: { namespace?: string; project_id: string }) {
  set({ ...project, last_edited: new Date() });
}

export function projectExists({
  namespace = context.namespace,
  project_id,
}: {
  namespace?: string;
  project_id: string;
}): boolean {
  const db = getDb();
  const x = db
    .prepare(
      "SELECT COUNT(*) AS count FROM projects WHERE namespace=? AND project_id=?",
    )
    .get(namespace, project_id);
  return (x as any).count > 0;
}

export function get({
  namespace = context.namespace,
  project_id,
}: {
  namespace?: string;
  project_id: string;
}): Project {
  const db = getDb();
  const project = db
    .prepare("SELECT * FROM projects WHERE namespace=? AND project_id=?")
    .get(namespace, project_id) as any;
  if (project == null) {
    throw Error(`no project ${project_id} in namespace ${namespace}`);
  }
  for (const key of ["nfs", "snapshots"]) {
    project[key] = project[key]?.split(",") ?? [];
  }
  project["archived"] = !!project["archived"];
  if (project.last_edited) {
    project.last_edited = new Date(project.last_edited);
  }
  return project as Project;
}

export function create({
  namespace = context.namespace,
  project_id,
  pool,
  affinity,
}: {
  namespace?: string;
  project_id: string;
  pool: string;
  affinity?: string;
}) {
  if (!isValidUUID(project_id)) {
    throw Error(`project_id must be a valid uuid - ${project_id}`);
  }
  if (!pool.startsWith(POOL_PREFIX)) {
    throw Error(`pool must start with ${POOL_PREFIX} - ${pool}`);
  }
  if (!namespace) {
    throw Error("namespace must be specified");
  }
  getDb()
    .prepare(
      "INSERT INTO projects(namespace, project_id, pool, affinity, last_edited) VALUES(?,?,?,?,?)",
    )
    .run(namespace, project_id, pool, affinity, new Date().toISOString());
}

export function getAll({
  namespace = context.namespace,
}: { namespace?: string } = {}): RawProject[] {
  const db = getDb();
  return db
    .prepare("SELECT * FROM projects WHERE namespace=?")
    .all(namespace) as RawProject[];
}

export function getRecent({
  namespace,
  cutoff,
}: {
  namespace?: string;
  cutoff?: Date;
} = {}): RawProject[] {
  const db = getDb();
  if (cutoff == null) {
    cutoff = new Date(Date.now() - 1000 * 60 * 60 * 24 * 7);
  }
  const query = "SELECT * FROM projects WHERE last_edited>=?";
  if (namespace == null) {
    return db.prepare(query).all(cutoff.toISOString()) as RawProject[];
  } else {
    return db
      .prepare(`${query} AND namespace=?`)
      .all(cutoff.toISOString(), namespace) as RawProject[];
  }
}
