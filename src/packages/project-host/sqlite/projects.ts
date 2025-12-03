import {
  initDatabase,
  getDatabase,
  upsertRow,
  getRow,
} from "@cocalc/lite/hub/sqlite/database";
import { account_id } from "@cocalc/backend/data";

// Local cache of project metadata on a project-host. This mirrors the
// minimal information we need when the master is unreachable. Fields:
// - project_id: primary key
// - title: human-friendly project title
// - state: latest known run state (e.g. running/stopped)
// - state_reported: whether the latest state change has been reported to the master
// - image: container image used to start the project
// - disk: disk quota (bytes)
// - scratch: scratch quota (bytes)
// - last_seen: timestamp (ms) when we last touched the project locally
// - updated_at: timestamp (ms) of last local change
// - users: optional map of users/groups for the project
export interface ProjectRow {
  project_id: string;
  title?: string;
  state?: string;
  state_reported?: boolean;
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
      state_reported INTEGER,
      image TEXT,
      disk INTEGER,
      scratch INTEGER,
      last_seen INTEGER,
      updated_at INTEGER
    )
  `);
  // Older tables won't have state_reported; add it if missing.
  try {
    db.exec("ALTER TABLE projects ADD COLUMN state_reported INTEGER");
  } catch (err) {
    // ignore - column already exists
  }
  db.exec(
    "CREATE INDEX IF NOT EXISTS projects_state_idx ON projects(state, updated_at)",
  );
}

export function upsertProject(row: ProjectRow) {
  ensureProjectsTable();
  const db = getDatabase();
  const now = Date.now();
  const pk = JSON.stringify({ project_id: row.project_id });
  // The generic data table mirrors projects, but we still need values
  // from the concrete projects table (e.g., state_reported).
  const existingProjectsRow = db
    .prepare("SELECT state, state_reported FROM projects WHERE project_id=?")
    .get(row.project_id) || {};
  const existing = getRow("projects", pk) || {};

  const title =
    row.title ?? (existing as any).title ?? null;
  const existingState: string | null =
    row.state ?? existingProjectsRow.state ?? existing.state?.state ?? null;
  const state = existingState;
  const image = row.image ?? (existing as any).image ?? null;
  const disk = row.disk ?? existing.disk_quota ?? null;
  const scratch = row.scratch ?? existing.scratch ?? null;
  const last_seen = row.last_seen ?? (existing as any).last_seen ?? now;
  const updated_at = row.updated_at ?? now;
  const users =
    row.users ??
    existing.users ??
    (account_id ? { [account_id]: { group: "owner" } } : undefined);

  // Track whether the latest state has been reported to the master.
  // If a state is explicitly provided and differs from the current one,
  // mark it as not reported so the background reporter will retry.
  let state_reported: number | null | undefined = undefined;
  if (row.state_reported !== undefined) {
    state_reported = row.state_reported ? 1 : 0;
  }
  const stateChanged =
    row.state !== undefined && row.state !== existingProjectsRow.state;
  if (state_reported === undefined) {
    if (stateChanged) {
      state_reported = 0;
    } else if (existingProjectsRow.state_reported !== undefined) {
      state_reported = existingProjectsRow.state_reported;
    } else {
      state_reported = null;
    }
  }

  const stmt = db.prepare(`
    INSERT INTO projects(project_id, title, state, state_reported, image, disk, scratch, last_seen, updated_at)
    VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(project_id) DO UPDATE SET
      title=excluded.title,
      state=excluded.state,
      state_reported=excluded.state_reported,
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
    state_reported,
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
    state_reported: state_reported ?? existingProjectsRow.state_reported,
  });
}

export function touchProject(project_id: string, state?: string) {
  upsertProject({ project_id, state, last_seen: Date.now() });
}

export function listProjects(): ProjectRow[] {
  ensureProjectsTable();
  const db = getDatabase();
  const stmt = db.prepare(
    "SELECT project_id, title, state, state_reported, image, disk, scratch, last_seen, updated_at FROM projects",
  );
  return stmt.all() as ProjectRow[];
}

export function listUnreportedProjects(): ProjectRow[] {
  ensureProjectsTable();
  const db = getDatabase();
  const stmt = db.prepare(
    "SELECT project_id, state FROM projects WHERE state_reported = 0",
  );
  return stmt.all() as ProjectRow[];
}

export function markProjectStateReported(project_id: string) {
  ensureProjectsTable();
  const db = getDatabase();
  db.prepare(
    "UPDATE projects SET state_reported=1 WHERE project_id=?",
  ).run(project_id);
}
