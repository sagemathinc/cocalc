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
