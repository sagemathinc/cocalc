import {
  getDatabase,
  getRow,
  initDatabase,
} from "@cocalc/lite/hub/sqlite/database";

export interface HostRow {
  host_id: string;
  sshpiperd_public_key?: string | null;
  sshpiperd_private_key?: string | null;
  updated_at?: number;
}

function ensureHostsTable() {
  const db = initDatabase();
  db.exec(`
    CREATE TABLE IF NOT EXISTS project_hosts (
      host_id TEXT PRIMARY KEY,
      sshpiperd_public_key TEXT,
      sshpiperd_private_key TEXT,
      updated_at INTEGER
    )
  `);
  try {
    db.exec("ALTER TABLE project_hosts ADD COLUMN sshpiperd_public_key TEXT");
  } catch {}
  try {
    db.exec("ALTER TABLE project_hosts ADD COLUMN sshpiperd_private_key TEXT");
  } catch {}
  try {
    db.exec("ALTER TABLE project_hosts ADD COLUMN updated_at INTEGER");
  } catch {}
}

export function getLocalHostId(): string | undefined {
  const row = getRow("project-host", "host-id") as
    | { hostId?: string }
    | undefined;
  return row?.hostId;
}

export function getHost(host_id: string): HostRow | undefined {
  ensureHostsTable();
  const db = getDatabase();
  const row = db
    .prepare(
      `SELECT host_id,
       sshpiperd_public_key,
       sshpiperd_private_key,
       updated_at
       FROM project_hosts WHERE host_id=?`,
    )
    .get(host_id) as HostRow | undefined;
  if (!row) return undefined;
  // migrate legacy columns on read
  return row;
}

export function upsertHost(row: HostRow) {
  if (!row?.host_id) return;
  ensureHostsTable();
  const db = getDatabase();
  const now = Date.now();
  db.prepare(
    `
    INSERT INTO project_hosts(
      host_id,
      sshpiperd_public_key,
      sshpiperd_private_key,
      updated_at
    )
    VALUES (
      :host_id,
      :sshpiperd_public_key,
      :sshpiperd_private_key,
      :updated_at
    )
    ON CONFLICT(host_id) DO UPDATE SET
      sshpiperd_public_key=COALESCE(excluded.sshpiperd_public_key, project_hosts.sshpiperd_public_key),
      sshpiperd_private_key=COALESCE(excluded.sshpiperd_private_key, project_hosts.sshpiperd_private_key),
      updated_at=excluded.updated_at
  `,
  ).run({
    host_id: row.host_id,
    sshpiperd_public_key: row.sshpiperd_public_key ?? null,
    sshpiperd_private_key: row.sshpiperd_private_key ?? null,
    updated_at: now,
  });
}

// IMPORTANT: do not add a "list all hosts" helper. For scalability and
// security we always address hosts individually by host_id.
