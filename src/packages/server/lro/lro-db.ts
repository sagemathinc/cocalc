import { randomUUID } from "node:crypto";
import getPool from "@cocalc/database/pool";
import type {
  LroScopeType,
  LroStatus,
  LroSummary,
} from "@cocalc/conat/hub/api/lro";

const TERMINAL_STATUSES: LroStatus[] = [
  "succeeded",
  "failed",
  "canceled",
  "expired",
];

const pool = () => getPool();

export async function ensureLroSchema(): Promise<void> {
  await pool().query(`
    CREATE TABLE IF NOT EXISTS long_running_operations (
      op_id UUID PRIMARY KEY,
      kind TEXT NOT NULL,
      scope_type TEXT NOT NULL,
      scope_id UUID NOT NULL,
      status TEXT NOT NULL,
      created_by UUID,
      owner_type TEXT,
      owner_id UUID,
      routing TEXT,
      input JSONB DEFAULT '{}'::jsonb,
      result JSONB DEFAULT '{}'::jsonb,
      error TEXT,
      progress_summary JSONB DEFAULT '{}'::jsonb,
      attempt INTEGER DEFAULT 0,
      heartbeat_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT now(),
      started_at TIMESTAMPTZ,
      finished_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ DEFAULT now(),
      expires_at TIMESTAMPTZ NOT NULL,
      dedupe_key TEXT,
      parent_id UUID
    )
  `);
  await pool().query(
    "CREATE INDEX IF NOT EXISTS lro_scope_status_idx ON long_running_operations(scope_type, scope_id, status)",
  );
  await pool().query(
    "CREATE INDEX IF NOT EXISTS lro_owner_status_idx ON long_running_operations(owner_type, owner_id, status)",
  );
  await pool().query(
    "CREATE INDEX IF NOT EXISTS lro_dedupe_idx ON long_running_operations(dedupe_key, scope_type, scope_id)",
  );
  await pool().query(
    "CREATE INDEX IF NOT EXISTS lro_updated_idx ON long_running_operations(updated_at)",
  );
}

export async function createLro({
  kind,
  scope_type,
  scope_id,
  created_by,
  owner_type,
  owner_id,
  routing,
  input,
  dedupe_key,
  expires_at,
  status = "queued",
}: {
  kind: string;
  scope_type: LroScopeType;
  scope_id: string;
  created_by?: string;
  owner_type?: "hub" | "host";
  owner_id?: string;
  routing?: string;
  input?: any;
  dedupe_key?: string;
  expires_at?: Date;
  status?: LroStatus;
}): Promise<LroSummary> {
  await ensureLroSchema();
  if (dedupe_key) {
    const existing = await pool().query(
      `
        SELECT *
        FROM long_running_operations
        WHERE scope_type=$1
          AND scope_id=$2
          AND dedupe_key=$3
          AND status <> ALL($4::text[])
        LIMIT 1
      `,
      [scope_type, scope_id, dedupe_key, TERMINAL_STATUSES],
    );
    if (existing.rows[0]) {
      return existing.rows[0] as LroSummary;
    }
  }
  const op_id = randomUUID();
  const expires = expires_at ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const { rows } = await pool().query(
    `
      INSERT INTO long_running_operations
        (op_id, kind, scope_type, scope_id, status, created_by, owner_type, owner_id, routing, input, expires_at, dedupe_key)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      RETURNING *
    `,
    [
      op_id,
      kind,
      scope_type,
      scope_id,
      status,
      created_by ?? null,
      owner_type ?? null,
      owner_id ?? null,
      routing ?? null,
      input ?? null,
      expires,
      dedupe_key ?? null,
    ],
  );
  return rows[0] as LroSummary;
}

export async function updateLro({
  op_id,
  status,
  result,
  error,
  progress_summary,
  attempt,
  heartbeat_at,
}: {
  op_id: string;
  status?: LroStatus;
  result?: any;
  error?: string | null;
  progress_summary?: any;
  attempt?: number;
  heartbeat_at?: Date | null;
}): Promise<LroSummary | undefined> {
  await ensureLroSchema();
  const sets: string[] = [];
  const values: any[] = [op_id];
  let idx = 2;
  if (status !== undefined) {
    sets.push(`status=$${idx++}`);
    values.push(status);
    if (status === "running") {
      sets.push(`started_at=COALESCE(started_at, now())`);
    }
    if (TERMINAL_STATUSES.includes(status)) {
      sets.push(`finished_at=COALESCE(finished_at, now())`);
    }
  }
  if (result !== undefined) {
    sets.push(`result=$${idx++}`);
    values.push(result ?? null);
  }
  if (error !== undefined) {
    sets.push(`error=$${idx++}`);
    values.push(error);
  }
  if (progress_summary !== undefined) {
    sets.push(`progress_summary=$${idx++}`);
    values.push(progress_summary ?? null);
  }
  if (attempt !== undefined) {
    sets.push(`attempt=$${idx++}`);
    values.push(attempt);
  }
  if (heartbeat_at !== undefined) {
    sets.push(`heartbeat_at=$${idx++}`);
    values.push(heartbeat_at);
  }
  if (!sets.length) {
    const row = await getLro(op_id);
    return row ?? undefined;
  }
  sets.push("updated_at=now()");
  const { rows } = await pool().query(
    `UPDATE long_running_operations SET ${sets.join(", ")} WHERE op_id=$1 RETURNING *`,
    values,
  );
  return rows[0] as LroSummary | undefined;
}

export async function getLro(
  op_id: string,
): Promise<LroSummary | undefined> {
  await ensureLroSchema();
  const { rows } = await pool().query(
    "SELECT * FROM long_running_operations WHERE op_id=$1",
    [op_id],
  );
  return rows[0] as LroSummary | undefined;
}

export async function listLro({
  scope_type,
  scope_id,
  include_completed = false,
}: {
  scope_type: LroScopeType;
  scope_id: string;
  include_completed?: boolean;
}): Promise<LroSummary[]> {
  await ensureLroSchema();
  const values: any[] = [scope_type, scope_id];
  let statusClause = "";
  if (!include_completed) {
    values.push(TERMINAL_STATUSES);
    statusClause = "AND status <> ALL($3::text[])";
  }
  const { rows } = await pool().query(
    `
      SELECT *
      FROM long_running_operations
      WHERE scope_type=$1
        AND scope_id=$2
        ${statusClause}
      ORDER BY created_at DESC
    `,
    values,
  );
  return rows as LroSummary[];
}
