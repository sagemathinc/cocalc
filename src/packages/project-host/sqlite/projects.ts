import { initDatabase, getDatabase } from "@cocalc/lite/hub/sqlite/database";

export interface ProjectRow {
  project_id: string;
  name?: string;
  state?: string;
  image?: string;
  disk?: number;
  scratch?: number;
  last_seen?: number;
  updated_at?: number;
}

function ensureProjectsTable() {
  const db = initDatabase();
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      project_id TEXT PRIMARY KEY,
      name TEXT,
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
  const stmt = db.prepare(`
    INSERT INTO projects(project_id, name, state, image, disk, scratch, last_seen, updated_at)
    VALUES(?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(project_id) DO UPDATE SET
      name=excluded.name,
      state=excluded.state,
      image=excluded.image,
      disk=excluded.disk,
      scratch=excluded.scratch,
      last_seen=excluded.last_seen,
      updated_at=excluded.updated_at
  `);
  stmt.run(
    row.project_id,
    row.name ?? null,
    row.state ?? null,
    row.image ?? null,
    row.disk ?? null,
    row.scratch ?? null,
    row.last_seen ?? now,
    row.updated_at ?? now,
  );
}

export function touchProject(project_id: string, state?: string) {
  upsertProject({ project_id, state, last_seen: Date.now() });
}

export function listProjects(): ProjectRow[] {
  ensureProjectsTable();
  const db = getDatabase();
  const stmt = db.prepare(
    "SELECT project_id, name, state, image, disk, scratch, last_seen, updated_at FROM projects",
  );
  return stmt.all() as ProjectRow[];
}
