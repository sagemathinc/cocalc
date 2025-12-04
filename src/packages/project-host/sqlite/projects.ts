import {
  initDatabase,
  getDatabase,
  upsertRow,
  getRow,
} from "@cocalc/lite/hub/sqlite/database";
import { account_id } from "@cocalc/backend/data";

function parseRunQuota(run_quota?: any): any | undefined {
  if (run_quota == null) return undefined;
  if (typeof run_quota === "string") {
    try {
      return JSON.parse(run_quota);
    } catch {
      return undefined;
    }
  }
  if (typeof run_quota === "object") {
    return run_quota;
  }
  return undefined;
}

function serializeRunQuota(run_quota?: any): string | null {
  const parsed = parseRunQuota(run_quota);
  if (parsed == null) return null;
  try {
    return JSON.stringify(parsed);
  } catch {
    return null;
  }
}

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
// - http_port / ssh_port: host-exposed ports for the project container (if running)
// - authorized_keys: concatenated SSH keys from master (account + project keys); the project’s own
//   ~/.ssh/authorized_keys is read directly from the filesystem at auth time.
// - run_quota: resource limits/settings passed from the master (mirrors projects.run_quota in Postgres)
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
  http_port?: number | null;
  ssh_port?: number | null;
  authorized_keys?: string | null;
  run_quota?: any;
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
      updated_at INTEGER,
      http_port INTEGER,
      ssh_port INTEGER,
      authorized_keys TEXT,
      run_quota TEXT
    )
  `);
  // Older tables won't have state_reported; add it if missing.
  try {
    db.exec("ALTER TABLE projects ADD COLUMN state_reported INTEGER");
  } catch (err) {
    // ignore - column already exists
  }
  try {
    db.exec("ALTER TABLE projects ADD COLUMN http_port INTEGER");
  } catch {}
  try {
    db.exec("ALTER TABLE projects ADD COLUMN ssh_port INTEGER");
  } catch {}
  try {
    db.exec("ALTER TABLE projects ADD COLUMN authorized_keys TEXT");
  } catch {}
  try {
    db.exec("ALTER TABLE projects ADD COLUMN run_quota TEXT");
  } catch {}
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
    .prepare(
      "SELECT state, state_reported, http_port, ssh_port, authorized_keys, run_quota FROM projects WHERE project_id=?",
    )
    .get(row.project_id) || {};
  const existing = getRow("projects", pk) || {};

  const title =
    row.title ?? (existing as any).title ?? null;
  const existingState: string | null =
    row.state ?? existingProjectsRow.state ?? existing.state?.state ?? null;
  const state = existingState;
  const image = row.image ?? (existing as any).image ?? null;
  const incomingRunQuota = parseRunQuota(row.run_quota);
  const existingRunQuota = parseRunQuota(
    (existingProjectsRow as any).run_quota ?? (existing as any).run_quota,
  );
  const run_quota = incomingRunQuota ?? existingRunQuota;
  const diskFromQuota =
    run_quota?.disk_quota != null
      ? Math.floor(run_quota.disk_quota * 1_000_000)
      : undefined;
  const disk = row.disk ?? diskFromQuota ?? existing.disk_quota ?? null;
  const scratch = row.scratch ?? diskFromQuota ?? existing.scratch ?? null;
  const last_seen = row.last_seen ?? (existing as any).last_seen ?? now;
  const updated_at = row.updated_at ?? now;
  const users =
    row.users ??
    existing.users ??
    (account_id ? { [account_id]: { group: "owner" } } : undefined);
  const http_port =
    row.http_port ?? (existing as any).http_port ?? existingProjectsRow.http_port ?? null;
  const ssh_port =
    row.ssh_port ?? (existing as any).ssh_port ?? existingProjectsRow.ssh_port ?? null;
  const authorized_keys =
    row.authorized_keys ??
    (existing as any).authorized_keys ??
    (existingProjectsRow as any).authorized_keys ??
    null;
  const run_quota_json = serializeRunQuota(run_quota);

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
    INSERT INTO projects(project_id, title, state, state_reported, image, disk, scratch, last_seen, updated_at, http_port, ssh_port, authorized_keys, run_quota)
    VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(project_id) DO UPDATE SET
      title=excluded.title,
      state=excluded.state,
      state_reported=excluded.state_reported,
      image=excluded.image,
      disk=excluded.disk,
      scratch=excluded.scratch,
      last_seen=excluded.last_seen,
      updated_at=excluded.updated_at,
      http_port=excluded.http_port,
      ssh_port=excluded.ssh_port,
      authorized_keys=excluded.authorized_keys,
      run_quota=excluded.run_quota
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
    http_port,
    ssh_port,
    authorized_keys,
    run_quota_json,
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
    http_port,
    ssh_port,
    authorized_keys,
    run_quota: run_quota ?? existing.run_quota,
  });
}

export function touchProject(project_id: string, state?: string) {
  upsertProject({ project_id, state, last_seen: Date.now() });
}

export function listProjects(): ProjectRow[] {
  ensureProjectsTable();
  const db = getDatabase();
  const stmt = db.prepare(
    "SELECT project_id, title, state, state_reported, image, disk, scratch, last_seen, updated_at, http_port, ssh_port, run_quota FROM projects",
  );
  return stmt.all() as ProjectRow[];
}

export function getProject(project_id: string): ProjectRow | undefined {
  ensureProjectsTable();
  const db = getDatabase();
  const stmt = db.prepare(
    "SELECT project_id, title, state, state_reported, image, disk, scratch, last_seen, updated_at, http_port, ssh_port, authorized_keys, run_quota FROM projects WHERE project_id=?",
  );
  const row = stmt.get(project_id) as any;
  if (row?.run_quota) {
    row.run_quota = parseRunQuota(row.run_quota);
  }
  return row as ProjectRow | undefined;
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

export function getProjectPorts(
  project_id: string,
): { http_port?: number | null; ssh_port?: number | null } {
  ensureProjectsTable();
  const db = getDatabase();
  const row = db
    .prepare("SELECT http_port, ssh_port FROM projects WHERE project_id=?")
    .get(project_id) as { http_port?: number; ssh_port?: number } | undefined;
  return row ?? {};
}
