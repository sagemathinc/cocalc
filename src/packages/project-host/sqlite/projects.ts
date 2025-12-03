import {
  initDatabase,
  getDatabase,
  upsertRow,
  getRow,
} from "@cocalc/lite/hub/sqlite/database";
import { account_id } from "@cocalc/backend/data";

export interface ProjectRow {
  project_id: string;
  title?: string;
  state?: string;
  image?: string;
  disk?: number;
  scratch?: number;
  last_seen?: number;
  updated_at?: number;
  users?: Record<string, any>;
}

function ensureProjectsTable() {
  const db = initDatabase();
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      project_id TEXT PRIMARY KEY,
      title TEXT,
      state TEXT,
      image TEXT,
      disk INTEGER,
      scratch INTEGER,
      last_seen INTEGER,
      updated_at INTEGER
    )
  `);
  db.exec(
    "CREATE INDEX IF NOT EXISTS projects_state_idx ON projects(state, updated_at)",
  );
}

export function upsertProject(row: ProjectRow) {
  ensureProjectsTable();
  const db = getDatabase();
  const now = Date.now();
  const pk = JSON.stringify({ project_id: row.project_id });
  const existing = getRow("projects", pk) || {};

  const title =
    row.title ?? (existing as any).title ?? null;
  const state = row.state ?? existing.state?.state ?? null;
  const image = row.image ?? (existing as any).image ?? null;
  const disk = row.disk ?? existing.disk_quota ?? null;
  const scratch = row.scratch ?? existing.scratch ?? null;
  const last_seen = row.last_seen ?? (existing as any).last_seen ?? now;
  const updated_at = row.updated_at ?? now;
  const users =
    row.users ??
    existing.users ??
    (account_id ? { [account_id]: { group: "owner" } } : undefined);

  const stmt = db.prepare(`
    INSERT INTO projects(project_id, title, state, image, disk, scratch, last_seen, updated_at)
    VALUES(?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(project_id) DO UPDATE SET
      title=excluded.title,
      state=excluded.state,
      image=excluded.image,
      disk=excluded.disk,
      scratch=excluded.scratch,
      last_seen=excluded.last_seen,
      updated_at=excluded.updated_at
  `);
  stmt.run(
    row.project_id,
    title,
    state,
    image,
    disk,
    scratch,
    last_seen,
    updated_at,
  );

  // Also mirror into the generic data table for changefeeds/UI.
  upsertRow("projects", pk, {
    ...existing,
    project_id: row.project_id,
    title: title ?? row.project_id,
    state: state ? { state } : existing.state,
    disk_quota: disk ?? existing.disk_quota,
    scratch: scratch ?? existing.scratch,
    last_edited: updated_at,
    users,
  });
}

export function touchProject(project_id: string, state?: string) {
  upsertProject({ project_id, state, last_seen: Date.now() });
}

export function listProjects(): ProjectRow[] {
  ensureProjectsTable();
  const db = getDatabase();
  const stmt = db.prepare(
    "SELECT project_id, title, state, image, disk, scratch, last_seen, updated_at FROM projects",
  );
  return stmt.all() as ProjectRow[];
}
