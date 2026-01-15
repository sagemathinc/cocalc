import getLogger from "@cocalc/backend/logger";
import getPool from "@cocalc/database/pool";
import type { ProjectMoveRow } from "@cocalc/conat/hub/api/projects";
export type { ProjectMoveRow };

const logger = getLogger("server:project-host:move-db");
const pool = () => getPool();

export async function ensureMoveSchema(): Promise<void> {
  // The table tracks long-running move orchestration and is safe to call repeatedly.
  await pool().query(`
    CREATE TABLE IF NOT EXISTS project_moves (
      project_id UUID PRIMARY KEY,
      source_host_id UUID,
      dest_host_id UUID,
      op_id UUID,
      state TEXT NOT NULL,
      status_reason TEXT,
      snapshot_name TEXT,
      progress JSONB DEFAULT '{}'::jsonb,
      attempt INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    )
  `);
  await pool().query(
    "CREATE INDEX IF NOT EXISTS project_moves_state_idx ON project_moves(state)",
  );
  await pool().query(
    "ALTER TABLE projects ADD COLUMN IF NOT EXISTS move_status JSONB",
  );
  await pool().query(
    "ALTER TABLE project_moves ADD COLUMN IF NOT EXISTS op_id UUID",
  );
}

function buildStatusPayload(row: ProjectMoveRow | undefined): any | null {
  if (!row) return null;
  return {
    state: row.state,
    status_reason: row.status_reason ?? undefined,
    progress: row.progress ?? {},
    snapshot_name: row.snapshot_name ?? undefined,
    source_host_id: row.source_host_id ?? undefined,
    dest_host_id: row.dest_host_id ?? undefined,
    op_id: row.op_id ?? undefined,
    updated_at: row.updated_at ?? new Date(),
  };
}

export async function writeMoveStatusToProject(
  project_id: string,
  row?: ProjectMoveRow,
) {
  const status = buildStatusPayload(row);
  await pool().query("UPDATE projects SET move_status=$2 WHERE project_id=$1", [
    project_id,
    status,
  ]);
}

export async function upsertMove(
  row: Partial<ProjectMoveRow> & { project_id: string },
) {
  const {
    project_id,
    source_host_id = null,
    dest_host_id = null,
    op_id = null,
    state = "queued",
    status_reason = null,
    snapshot_name = null,
    progress = {},
    attempt = 0,
  } = row;
  const { rows } = await pool().query(
    `
      INSERT INTO project_moves
        (project_id, source_host_id, dest_host_id, op_id, state, status_reason, snapshot_name, progress, attempt)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (project_id) DO UPDATE
        SET source_host_id=EXCLUDED.source_host_id,
            dest_host_id=EXCLUDED.dest_host_id,
            op_id=EXCLUDED.op_id,
            state=EXCLUDED.state,
            status_reason=EXCLUDED.status_reason,
            snapshot_name=EXCLUDED.snapshot_name,
            progress=EXCLUDED.progress,
            attempt=project_moves.attempt,
            updated_at=now()
      RETURNING *
    `,
    [
      project_id,
      source_host_id,
      dest_host_id,
      op_id,
      state,
      status_reason,
      snapshot_name,
      progress,
      attempt,
    ],
  );
  const updated = rows[0] as ProjectMoveRow;
  await writeMoveStatusToProject(project_id, updated);
  return updated;
}

export async function updateMove(
  project_id: string,
  fields: Partial<ProjectMoveRow>,
): Promise<ProjectMoveRow | undefined> {
  const sets: string[] = [];
  const values: any[] = [project_id];
  let idx = 2;
  for (const [key, val] of Object.entries(fields)) {
    if (val === undefined) continue;
    sets.push(`${key}=$${idx++}`);
    values.push(val);
  }
  if (!sets.length) {
    const row = await getMove(project_id);
    await writeMoveStatusToProject(project_id, row ?? undefined);
    return row ?? undefined;
  }
  sets.push(`updated_at=now()`);
  const { rows } = await pool().query(
    `UPDATE project_moves SET ${sets.join(", ")} WHERE project_id=$1 RETURNING *`,
    values,
  );
  const updated = rows[0] as ProjectMoveRow;
  await writeMoveStatusToProject(project_id, updated);
  return updated;
}

export async function getMove(
  project_id: string,
): Promise<ProjectMoveRow | undefined> {
  const { rows } = await pool().query(
    "SELECT * FROM project_moves WHERE project_id=$1",
    [project_id],
  );
  return rows[0] as ProjectMoveRow | undefined;
}

export async function fetchActiveMoves(
  limit = 5,
): Promise<ProjectMoveRow[]> {
  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    // Pattern: dequeue the oldest pending rows without contending.
    // - FOR UPDATE SKIP LOCKED lets multiple workers safely "pop" work items:
    //   rows another worker already locked are skipped instead of blocking.
    // - We do the select inside a transaction so the locks are held together;
    //   the caller should promptly transition these rows to a new state so
    //   they drop out of subsequent queries. If a worker crashes before that,
    //   the locks release on rollback/connection close and another worker can
    //   pick them up on the next pass.
    const { rows } = await client.query(
      `
        SELECT *
        FROM project_moves
        WHERE state IN ('queued','preparing','sending','finalizing')
        ORDER BY updated_at
        FOR UPDATE SKIP LOCKED
        LIMIT $1
      `,
      [limit],
    );
    await client.query("COMMIT");
    return rows as ProjectMoveRow[];
  } catch (err) {
    await client.query("ROLLBACK");
    logger.warn("fetchActiveMoves failed", { err });
    return [];
  } finally {
    client.release();
  }
}

export async function recycleStaleMoves(
  staleMs = 120_000,
): Promise<ProjectMoveRow[]> {
  // Mark stale in-flight moves as failing instead of retrying automatically.
  // This avoids silent bandwidth churn if hosts restart or links are unreliable.
  const { rows } = await pool().query(
    `
      UPDATE project_moves
      SET state='failing',
          status_reason='stale move: no progress; manual restart required',
          snapshot_name=NULL,
          progress=jsonb_build_object('phase','failing'),
          attempt=attempt+1,
          updated_at=now()
      WHERE state IN ('sending','finalizing')
        AND updated_at < now() - ($1::text || ' milliseconds')::interval
      RETURNING *
    `,
    [staleMs],
  );
  for (const row of rows as ProjectMoveRow[]) {
    await writeMoveStatusToProject(row.project_id, row);
  }
  return rows as ProjectMoveRow[];
}
