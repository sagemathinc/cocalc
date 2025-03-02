/*
Database
*/

import Database from "better-sqlite3";
import { context } from "./index";
import type { Project } from "./types";

let db: null | Database.Database;
export function getDb(): Database.Database {
  if (db == null) {
    db = new Database("projects.db");
    db.prepare(
      `CREATE TABLE IF NOT EXISTS projects (
          namespace TEXT,
          project_id TEXT,
          pool TEXT,
          archived TEXT,
          affinity TEXT,
          nfs TEXT,
          snapshots TEXT,
          last_edited TEXT,
          last_send_snapshot TEXT,
        PRIMARY KEY (namespace, project_id)
      )`,
    ).run();
  }
  return db!;
}

export function dbProject({
  namespace = context.namespace,
  project_id,
}: {
  namespace?: string;
  project_id: string;
}): Project {
  const db = getDb();
  const x = db
    .prepare("SELECT * FROM projects WHERE namespace=? AND project_id=?")
    .get(namespace, project_id) as Project;
  for (const key of ["nfs", "snapshots"]) {
    x[key] = x[key] != null ? x[key].split(",") : [];
  }
  return x as Project;
}

export function dbAllProjects({
  namespace = context.namespace,
}: { namespace?: string } = {}) {
  const db = getDb();
  return db
    .prepare("SELECT * FROM projects WHERE namespace=?")
    .all(namespace) as Project[];
}

export function getRecentProjects({
  namespace,
  cutoff,
}: {
  namespace?: string;
  cutoff?: Date;
} = {}): { project_id: string; last_edited: string; namespace: string }[] {
  const db = getDb();
  if (cutoff == null) {
    cutoff = new Date(Date.now() - 1000 * 60 * 60 * 24 * 7);
  }
  const query =
    "SELECT project_id, last_edited, namespace FROM projects WHERE last_edited>=?";
  if (namespace == null) {
    return db.prepare(query).all(cutoff.toISOString()) as any;
  } else {
    return db
      .prepare(`${query} AND namespace=?`)
      .all(cutoff.toISOString(), namespace) as any;
  }
}
