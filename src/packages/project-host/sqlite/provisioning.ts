import { getDatabase, initDatabase } from "@cocalc/lite/hub/sqlite/database";

export interface ProvisioningRow {
  project_id: string;
  provisioned: boolean;
  provisioned_reported?: boolean;
  updated_at?: number;
}

function ensureProvisioningTable() {
  const db = initDatabase();
  db.exec(`
    CREATE TABLE IF NOT EXISTS project_provisioning (
      project_id TEXT PRIMARY KEY,
      provisioned INTEGER,
      provisioned_reported INTEGER,
      updated_at INTEGER
    )
  `);
  try {
    db.exec("ALTER TABLE project_provisioning ADD COLUMN provisioned INTEGER");
  } catch {}
  try {
    db.exec(
      "ALTER TABLE project_provisioning ADD COLUMN provisioned_reported INTEGER",
    );
  } catch {}
  try {
    db.exec("ALTER TABLE project_provisioning ADD COLUMN updated_at INTEGER");
  } catch {}
}

export function setProjectProvisioned(
  project_id: string,
  provisioned: boolean,
) {
  ensureProvisioningTable();
  const db = getDatabase();
  const now = Date.now();
  db.prepare(
    `
    INSERT INTO project_provisioning (
      project_id,
      provisioned,
      provisioned_reported,
      updated_at
    )
    VALUES (?, ?, ?, ?)
    ON CONFLICT(project_id) DO UPDATE SET
      provisioned=excluded.provisioned,
      provisioned_reported=excluded.provisioned_reported,
      updated_at=excluded.updated_at
  `,
  ).run(project_id, provisioned ? 1 : 0, 0, now);
}

export function listUnreportedProvisioning(): ProvisioningRow[] {
  ensureProvisioningTable();
  const db = getDatabase();
  const stmt = db.prepare(
    "SELECT project_id, provisioned FROM project_provisioning WHERE provisioned_reported = 0",
  );
  const rows = stmt.all() as { project_id: string; provisioned?: number }[];
  return rows.map((row) => ({
    project_id: row.project_id,
    provisioned: !!row.provisioned,
  }));
}

export function markProjectProvisionedReported(project_id: string) {
  ensureProvisioningTable();
  const db = getDatabase();
  db.prepare(
    "UPDATE project_provisioning SET provisioned_reported=1 WHERE project_id=?",
  ).run(project_id);
}
