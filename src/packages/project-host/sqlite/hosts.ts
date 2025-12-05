import {
  getDatabase,
  getRow,
  initDatabase,
} from "@cocalc/lite/hub/sqlite/database";

export interface HostRow {
  host_id: string;
  host_ssh_key?: string | null;
  host_private_key?: string | null;
  updated_at?: number;
}

function ensureHostsTable() {
  const db = initDatabase();
  db.exec(`
    CREATE TABLE IF NOT EXISTS project_hosts (
      host_id TEXT PRIMARY KEY,
      host_ssh_key TEXT,
      host_private_key TEXT,
      updated_at INTEGER
    )
  `);
  try {
    db.exec("ALTER TABLE project_hosts ADD COLUMN host_private_key TEXT");
  } catch {}
  try {
    db.exec("ALTER TABLE project_hosts ADD COLUMN updated_at INTEGER");
  } catch {}
}

export function getLocalHostId(): string | undefined {
  const row = getRow("project-host", "host-id") as { hostId?: string } | undefined;
  return row?.hostId;
}

export function getHost(host_id: string): HostRow | undefined {
  ensureHostsTable();
  const db = getDatabase();
  return db
    .prepare(
      "SELECT host_id, host_ssh_key, host_private_key, updated_at FROM project_hosts WHERE host_id=?",
    )
    .get(host_id) as HostRow | undefined;
}

export function upsertHost(row: HostRow) {
  if (!row?.host_id) return;
  ensureHostsTable();
  const db = getDatabase();
  const now = Date.now();
  db.prepare(
    `
    INSERT INTO project_hosts(host_id, host_ssh_key, host_private_key, updated_at)
    VALUES (:host_id, :host_ssh_key, :host_private_key, :updated_at)
    ON CONFLICT(host_id) DO UPDATE SET
      host_ssh_key=COALESCE(excluded.host_ssh_key, project_hosts.host_ssh_key),
      host_private_key=COALESCE(excluded.host_private_key, project_hosts.host_private_key),
      updated_at=excluded.updated_at
  `,
  ).run({
    host_id: row.host_id,
    host_ssh_key: row.host_ssh_key ?? null,
    host_private_key: row.host_private_key ?? null,
    updated_at: now,
  });
}

export function listHosts(): HostRow[] {
  ensureHostsTable();
  const db = getDatabase();
  return db
    .prepare(
      "SELECT host_id, host_ssh_key, host_private_key, updated_at FROM project_hosts",
    )
    .all() as HostRow[];
}
