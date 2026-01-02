import { randomUUID } from "crypto";
import getPool from "@cocalc/database/pool";

const pool = () => getPool();

export type CloudVmLogEvent = {
  vm_id: string;
  action: string;
  status: string;
  provider?: string;
  spec?: Record<string, any>;
  runtime?: Record<string, any>;
  pricing_version?: string;
  error?: string;
};

export type CloudVmLogEntry = CloudVmLogEvent & {
  id: string;
  ts: Date | null;
};

export type CloudVmWorkRow = {
  id: string;
  vm_id: string;
  action: string;
  payload: Record<string, any>;
  state: string;
  attempt: number;
  locked_by?: string;
  locked_at?: Date;
  error?: string;
  created_at?: Date;
  updated_at?: Date;
};

export async function logCloudVmEvent(event: CloudVmLogEvent): Promise<void> {
  const id = randomUUID();
  await pool().query(
    `
      INSERT INTO cloud_vm_log
        (id, vm_id, ts, action, status, provider, spec, runtime, pricing_version, error)
      VALUES ($1,$2,NOW(),$3,$4,$5,$6,$7,$8,$9)
    `,
    [
      id,
      event.vm_id,
      event.action,
      event.status,
      event.provider ?? null,
      event.spec ?? null,
      event.runtime ?? null,
      event.pricing_version ?? null,
      event.error ?? null,
    ],
  );

  await pool().query(
    `
      UPDATE project_hosts
      SET metadata = jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              COALESCE(metadata, '{}'::jsonb),
              '{last_action}', to_jsonb($2::text)
            ),
            '{last_action_at}', to_jsonb(NOW())
          ),
          '{last_action_status}', to_jsonb($3::text)
        ),
        '{last_action_error}', COALESCE(to_jsonb($4::text), 'null'::jsonb)
      )
      WHERE id=$1 AND deleted IS NULL
    `,
    [
      event.vm_id,
      event.action,
      event.status,
      event.error ?? null,
    ],
  );
}

export async function listCloudVmLog(opts: {
  vm_id: string;
  limit?: number;
}): Promise<CloudVmLogEntry[]> {
  const { rows } = await pool().query<CloudVmLogEntry>(
    `
      SELECT id, vm_id, ts, action, status, provider, spec, runtime, pricing_version, error
      FROM cloud_vm_log
      WHERE vm_id=$1
      ORDER BY ts DESC NULLS LAST
      LIMIT $2
    `,
    [opts.vm_id, opts.limit ?? 50],
  );
  return rows;
}

export async function enqueueCloudVmWork(row: {
  vm_id: string;
  action: string;
  payload?: Record<string, any>;
}): Promise<string> {
  const id = randomUUID();
  await pool().query(
    `
      INSERT INTO cloud_vm_work (id, vm_id, action, payload, state)
      VALUES ($1,$2,$3,$4,'queued')
    `,
    [id, row.vm_id, row.action, row.payload ?? {}],
  );
  return id;
}

export async function enqueueCloudVmWorkOnce(row: {
  vm_id: string;
  action: string;
  payload?: Record<string, any>;
}): Promise<string | undefined> {
  const id = randomUUID();
  const { rowCount } = await pool().query(
    `
      INSERT INTO cloud_vm_work (id, vm_id, action, payload, state)
      SELECT $1,$2,$3,$4,'queued'
      WHERE NOT EXISTS (
        SELECT 1
        FROM cloud_vm_work
        WHERE vm_id=$2
          AND action=$3
          AND state IN ('queued','in_progress')
      )
    `,
    [id, row.vm_id, row.action, row.payload ?? {}],
  );
  return rowCount ? id : undefined;
}

export async function claimCloudVmWork(opts: {
  limit?: number;
  worker_id: string;
}): Promise<CloudVmWorkRow[]> {
  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<CloudVmWorkRow>(
      `
        SELECT *
        FROM cloud_vm_work
        WHERE state='queued'
        ORDER BY created_at
        LIMIT $1
        FOR UPDATE SKIP LOCKED
      `,
      [opts.limit ?? 1],
    );
    if (rows.length) {
      const ids = rows.map((r) => r.id);
      await client.query(
        `
          UPDATE cloud_vm_work
          SET state='in_progress',
              locked_by=$1,
              locked_at=now(),
              updated_at=now()
          WHERE id = ANY($2)
        `,
        [opts.worker_id, ids],
      );
    }
    await client.query("COMMIT");
    return rows;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function markCloudVmWorkDone(
  id: string,
  updates: { error?: string } = {},
): Promise<void> {
  await pool().query(
    `
      UPDATE cloud_vm_work
      SET state='done',
          error=$2,
          updated_at=now()
      WHERE id=$1
    `,
    [id, updates.error ?? null],
  );
}

export async function markCloudVmWorkFailed(
  id: string,
  error: string,
): Promise<void> {
  await pool().query(
    `
      UPDATE cloud_vm_work
      SET state='failed',
          error=$2,
          updated_at=now()
      WHERE id=$1
    `,
    [id, error],
  );
}

// No legacy metadata normalization: new installs should only use canonical
// provider ids (e.g., "gcp", "hyperstack", "lambda").
