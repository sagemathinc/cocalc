import getLogger from "@cocalc/backend/logger";
import getPool from "@cocalc/database/pool";
import { client as fileServerClient } from "@cocalc/conat/files/file-server";
import type {
  ProjectCopyRow,
  ProjectCopyState,
} from "@cocalc/conat/hub/api/projects";
import type { LroStatus } from "@cocalc/conat/hub/api/lro";
import { getLro, updateLro } from "@cocalc/server/lro/lro-db";
import { publishLroSummary } from "@cocalc/server/lro/stream";

const logger = getLogger("server:projects:copy-db");

const ACTIVE_STATUSES: ProjectCopyState[] = [
  "queued",
  "applying",
  "failed",
];
const TERMINAL_STATUSES: ProjectCopyState[] = [
  "done",
  "canceled",
  "expired",
];

async function refreshCopyOperation(op_id: string): Promise<void> {
  try {
    const lro = await getLro(op_id);
    const frozenStatus =
      lro?.status === "canceled" || lro?.status === "expired"
        ? lro.status
        : undefined;
    const { rows } = await pool().query(
      `
        SELECT status, COUNT(*)::int AS count, MAX(last_error) AS last_error
        FROM project_copies
        WHERE op_id=$1
        GROUP BY status
      `,
      [op_id],
    );
    if (!rows.length) return;
    const summary: Record<string, number> = {};
    let total = 0;
    let failed = 0;
    let lastError: string | null = null;
    for (const row of rows) {
      const count = Number(row.count ?? 0);
      summary[row.status] = count;
      total += count;
      if (row.status === "failed") {
        failed += count;
        if (!lastError && row.last_error) {
          lastError = row.last_error;
        }
      }
    }
    const queued = summary.queued ?? 0;
    const applying = summary.applying ?? 0;
    const done = summary.done ?? 0;
    const canceled = summary.canceled ?? 0;
    const expired = summary.expired ?? 0;
    const remaining = queued + applying;
    let status: LroStatus = "running";
    if (remaining === 0) {
      status = failed > 0 ? "failed" : "succeeded";
    }
    const progress_summary = {
      total,
      queued,
      applying,
      done,
      failed,
      canceled,
      expired,
    };
    const updated = await updateLro({
      op_id,
      status: frozenStatus ?? status,
      progress_summary,
      error:
        frozenStatus != null
          ? undefined
          : status === "failed"
            ? lastError
            : null,
      result:
        frozenStatus != null
          ? undefined
          : status === "succeeded"
            ? progress_summary
            : undefined,
    });
    if (updated) {
      await publishLroSummary({
        scope_type: updated.scope_type,
        scope_id: updated.scope_id,
        summary: updated,
      });
    }
  } catch (err) {
    logger.warn("refreshCopyOperation failed", { op_id, err: `${err}` });
  }
}

export type ProjectCopyKey = {
  src_project_id: string;
  src_path: string;
  dest_project_id: string;
  dest_path: string;
};

export type ProjectCopyInsert = ProjectCopyKey & {
  op_id?: string;
  snapshot_id: string;
  options?: any;
  expires_at: Date;
};

const pool = () => getPool();

export async function ensureCopySchema(): Promise<void> {
  await pool().query(`
    CREATE TABLE IF NOT EXISTS project_copies (
      src_project_id UUID NOT NULL,
      src_path TEXT NOT NULL,
      dest_project_id UUID NOT NULL,
      dest_path TEXT NOT NULL,
      op_id UUID,
      snapshot_id TEXT NOT NULL,
      options JSONB DEFAULT '{}'::jsonb,
      status TEXT NOT NULL,
      last_error TEXT,
      attempt INTEGER DEFAULT 0,
      last_attempt_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now(),
      expires_at TIMESTAMPTZ NOT NULL,
      PRIMARY KEY (src_project_id, src_path, dest_project_id, dest_path)
    )
  `);
  await pool().query(
    "ALTER TABLE project_copies ADD COLUMN IF NOT EXISTS op_id UUID",
  );
  await pool().query(
    "CREATE INDEX IF NOT EXISTS project_copies_status_idx ON project_copies(status)",
  );
  await pool().query(
    "CREATE INDEX IF NOT EXISTS project_copies_snapshot_idx ON project_copies(snapshot_id)",
  );
  await pool().query(
    "CREATE INDEX IF NOT EXISTS project_copies_op_idx ON project_copies(op_id)",
  );
  await pool().query(
    "CREATE INDEX IF NOT EXISTS project_copies_dest_idx ON project_copies(dest_project_id)",
  );
  await pool().query(
    "CREATE INDEX IF NOT EXISTS project_copies_expires_idx ON project_copies(expires_at)",
  );
}

async function countActiveSnapshotRefs(snapshot_id: string): Promise<number> {
  const { rows } = await pool().query(
    `
      SELECT COUNT(*) AS count
      FROM project_copies
      WHERE snapshot_id=$1
        AND status = ANY($2::text[])
    `,
    [snapshot_id, ACTIVE_STATUSES],
  );
  return Number(rows[0]?.count ?? 0);
}

async function maybeCleanupSnapshot({
  src_project_id,
  snapshot_id,
}: {
  src_project_id: string;
  snapshot_id: string;
}): Promise<void> {
  const activeCount = await countActiveSnapshotRefs(snapshot_id);
  if (activeCount > 0) return;
  try {
    await fileServerClient({ project_id: src_project_id }).deleteBackup({
      project_id: src_project_id,
      id: snapshot_id,
    });
  } catch (err) {
    logger.warn("snapshot cleanup failed", {
      src_project_id,
      snapshot_id,
      err: `${err}`,
    });
  }
}

export async function expireCopies(): Promise<ProjectCopyRow[]> {
  await ensureCopySchema();
  const { rows } = await pool().query(
    `
      UPDATE project_copies
      SET status='expired',
          last_error=COALESCE(last_error, 'expired'),
          updated_at=now()
      WHERE expires_at <= now()
        AND status <> ALL($1::text[])
      RETURNING *
    `,
    [TERMINAL_STATUSES],
  );
  const expired = rows as ProjectCopyRow[];
  const seen = new Set<string>();
  const opIds = new Set<string>();
  for (const row of expired) {
    const key = `${row.src_project_id}:${row.snapshot_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    await maybeCleanupSnapshot({
      src_project_id: row.src_project_id,
      snapshot_id: row.snapshot_id,
    });
    if (row.op_id) {
      opIds.add(row.op_id);
    }
  }
  for (const op_id of opIds) {
    await refreshCopyOperation(op_id);
  }
  return expired;
}

export async function upsertCopyRow(
  row: ProjectCopyInsert,
): Promise<ProjectCopyRow> {
  await ensureCopySchema();
  const {
    src_project_id,
    src_path,
    dest_project_id,
    dest_path,
    op_id,
    snapshot_id,
    options,
    expires_at,
  } = row;
  const existing = await pool().query<{ snapshot_id: string }>(
    `
      SELECT snapshot_id
      FROM project_copies
      WHERE src_project_id=$1
        AND src_path=$2
        AND dest_project_id=$3
        AND dest_path=$4
    `,
    [src_project_id, src_path, dest_project_id, dest_path],
  );
  const prevSnapshot = existing.rows[0]?.snapshot_id;
  const { rows } = await pool().query(
    `
      INSERT INTO project_copies
        (src_project_id, src_path, dest_project_id, dest_path, op_id, snapshot_id, options, status, attempt, last_attempt_at, expires_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,'queued',0,NULL,$8)
      ON CONFLICT (src_project_id, src_path, dest_project_id, dest_path) DO UPDATE
        SET op_id=EXCLUDED.op_id,
            snapshot_id=EXCLUDED.snapshot_id,
            options=EXCLUDED.options,
            status='queued',
            last_error=NULL,
            attempt=0,
            last_attempt_at=NULL,
            created_at=now(),
            updated_at=now(),
            expires_at=EXCLUDED.expires_at
      RETURNING *
    `,
    [
      src_project_id,
      src_path,
      dest_project_id,
      dest_path,
      op_id ?? null,
      snapshot_id,
      options ?? null,
      expires_at,
    ],
  );
  const updated = rows[0] as ProjectCopyRow;
  if (prevSnapshot && prevSnapshot !== snapshot_id) {
    await maybeCleanupSnapshot({
      src_project_id,
      snapshot_id: prevSnapshot,
    });
  }
  return updated;
}

export async function insertCopyRowIfMissing(
  row: ProjectCopyInsert,
): Promise<ProjectCopyRow | undefined> {
  await ensureCopySchema();
  const {
    src_project_id,
    src_path,
    dest_project_id,
    dest_path,
    op_id,
    snapshot_id,
    options,
    expires_at,
  } = row;
  const { rows } = await pool().query(
    `
      INSERT INTO project_copies
        (src_project_id, src_path, dest_project_id, dest_path, op_id, snapshot_id, options, status, attempt, last_attempt_at, expires_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,'queued',0,NULL,$8)
      ON CONFLICT (src_project_id, src_path, dest_project_id, dest_path) DO NOTHING
      RETURNING *
    `,
    [
      src_project_id,
      src_path,
      dest_project_id,
      dest_path,
      op_id ?? null,
      snapshot_id,
      options ?? null,
      expires_at,
    ],
  );
  return rows[0] as ProjectCopyRow | undefined;
}

export async function listCopiesForProject({
  project_id,
  include_completed = false,
}: {
  project_id: string;
  include_completed?: boolean;
}): Promise<ProjectCopyRow[]> {
  await expireCopies();
  const params: any[] = [project_id];
  let statusClause = "";
  if (!include_completed) {
    params.push(ACTIVE_STATUSES);
    statusClause = "AND status = ANY($2::text[])";
  }
  const { rows } = await pool().query(
    `
      SELECT *
      FROM project_copies
      WHERE (src_project_id=$1 OR dest_project_id=$1)
      ${statusClause}
      ORDER BY created_at DESC
    `,
    params,
  );
  return rows as ProjectCopyRow[];
}

export async function listCopiesByOpId({
  op_id,
}: {
  op_id: string;
}): Promise<ProjectCopyRow[]> {
  await ensureCopySchema();
  const { rows } = await pool().query(
    `
      SELECT *
      FROM project_copies
      WHERE op_id=$1
      ORDER BY created_at DESC
    `,
    [op_id],
  );
  return rows as ProjectCopyRow[];
}

export async function cancelCopy(
  key: ProjectCopyKey,
): Promise<ProjectCopyRow | undefined> {
  await expireCopies();
  const { src_project_id, src_path, dest_project_id, dest_path } = key;
  const { rows } = await pool().query(
    `
      UPDATE project_copies
      SET status='canceled',
          last_error=COALESCE(last_error, 'canceled'),
          updated_at=now()
      WHERE src_project_id=$1
        AND src_path=$2
        AND dest_project_id=$3
        AND dest_path=$4
        AND status <> ALL($5::text[])
      RETURNING *
    `,
    [src_project_id, src_path, dest_project_id, dest_path, TERMINAL_STATUSES],
  );
  const updated = rows[0] as ProjectCopyRow | undefined;
  if (updated) {
    await maybeCleanupSnapshot({
      src_project_id: updated.src_project_id,
      snapshot_id: updated.snapshot_id,
    });
    if (updated.op_id) {
      await refreshCopyOperation(updated.op_id);
    }
  }
  return updated;
}

export async function cancelCopiesByOpId({
  op_id,
  include_applying = false,
}: {
  op_id: string;
  include_applying?: boolean;
}): Promise<ProjectCopyRow[]> {
  await expireCopies();
  const statuses = include_applying ? ["queued", "failed", "applying"] : ["queued", "failed"];
  const { rows } = await pool().query(
    `
      UPDATE project_copies
      SET status='canceled',
          last_error=COALESCE(last_error, 'canceled'),
          updated_at=now()
      WHERE op_id=$1
        AND status = ANY($2::text[])
      RETURNING *
    `,
    [op_id, statuses],
  );
  const updatedRows = rows as ProjectCopyRow[];
  const seen = new Set<string>();
  for (const row of updatedRows) {
    const key = `${row.src_project_id}:${row.snapshot_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    await maybeCleanupSnapshot({
      src_project_id: row.src_project_id,
      snapshot_id: row.snapshot_id,
    });
  }
  await refreshCopyOperation(op_id);
  return updatedRows;
}

export async function claimPendingCopies({
  host_id,
  project_id,
  limit = 20,
}: {
  host_id: string;
  project_id?: string;
  limit?: number;
}): Promise<ProjectCopyRow[]> {
  await expireCopies();
  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    const values: any[] = [host_id, ["queued", "failed"]];
    let projectFilter = "";
    let limitIndex = 3;
    if (project_id) {
      values.push(project_id);
      projectFilter = "AND pc.dest_project_id=$3";
      limitIndex = 4;
    }
    values.push(limit);
    const { rows } = await client.query(
      `
        SELECT pc.*
        FROM project_copies pc
        JOIN projects p ON p.project_id = pc.dest_project_id
        WHERE p.host_id=$1
          AND pc.status = ANY($2::text[])
          AND pc.expires_at > now()
          ${projectFilter}
        ORDER BY pc.updated_at
        FOR UPDATE SKIP LOCKED
        LIMIT $${limitIndex}
      `,
      values,
    );
    if (!rows.length) {
      await client.query("COMMIT");
      return [];
    }
    const keyValues: any[] = [];
    const tuples = rows.map((row, idx) => {
      const offset = idx * 4;
      keyValues.push(
        row.src_project_id,
        row.src_path,
        row.dest_project_id,
        row.dest_path,
      );
      return `($${offset + 1},$${offset + 2},$${offset + 3},$${offset + 4})`;
    });
    const updated = await client.query(
      `
        UPDATE project_copies
        SET status='applying',
            attempt=attempt+1,
            last_attempt_at=now(),
            updated_at=now()
        WHERE (src_project_id, src_path, dest_project_id, dest_path) IN (${tuples.join(
          ",",
        )})
          AND status = ANY($${keyValues.length + 1}::text[])
        RETURNING *
      `,
      [...keyValues, ["queued", "failed"]],
    );
    await client.query("COMMIT");
    const opIds = new Set<string>();
    for (const row of updated.rows as ProjectCopyRow[]) {
      if (row.op_id) {
        opIds.add(row.op_id);
      }
    }
    for (const op_id of opIds) {
      await refreshCopyOperation(op_id);
    }
    return updated.rows as ProjectCopyRow[];
  } catch (err) {
    await client.query("ROLLBACK");
    logger.warn("claimPendingCopies failed", { err });
    throw err;
  } finally {
    client.release();
  }
}

export async function updateCopyStatus({
  key,
  status,
  last_error,
}: {
  key: ProjectCopyKey;
  status: ProjectCopyState;
  last_error?: string;
}): Promise<ProjectCopyRow | undefined> {
  await ensureCopySchema();
  const { src_project_id, src_path, dest_project_id, dest_path } = key;
  const { rows } = await pool().query(
    `
      UPDATE project_copies
      SET status=$5,
          last_error=$6,
          updated_at=now()
      WHERE src_project_id=$1
        AND src_path=$2
        AND dest_project_id=$3
        AND dest_path=$4
      RETURNING *
    `,
    [src_project_id, src_path, dest_project_id, dest_path, status, last_error ?? null],
  );
  const updated = rows[0] as ProjectCopyRow | undefined;
  if (
    updated &&
    (status === "done" || status === "canceled" || status === "expired")
  ) {
    await maybeCleanupSnapshot({
      src_project_id: updated.src_project_id,
      snapshot_id: updated.snapshot_id,
    });
  }
  if (updated?.op_id) {
    await refreshCopyOperation(updated.op_id);
  }
  return updated;
}
