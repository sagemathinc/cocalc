import { randomUUID } from "node:crypto";
import getPool from "@cocalc/database/pool";
import type {
  PublishedShare,
  SharePublishStatus,
  ShareScope,
} from "@cocalc/conat/hub/api/shares";

const pool = () => getPool();

export async function upsertPublishedShare({
  project_id,
  path,
  scope,
  org_id,
  indexing_opt_in,
}: {
  project_id: string;
  path: string;
  scope: ShareScope;
  org_id: string | null;
  indexing_opt_in: boolean;
}): Promise<PublishedShare> {
  const share_id = randomUUID();
  const { rows } = await pool().query(
    `
      INSERT INTO published_shares
        (share_id, project_id, path, scope, org_id, indexing_opt_in)
      VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (project_id, path)
      DO UPDATE SET
        scope=EXCLUDED.scope,
        org_id=EXCLUDED.org_id,
        indexing_opt_in=EXCLUDED.indexing_opt_in,
        updated_at=now()
      RETURNING *
    `,
    [share_id, project_id, path, scope, org_id, indexing_opt_in],
  );
  return rows[0] as PublishedShare;
}

export async function updatePublishedShare({
  share_id,
  scope,
  org_id,
  indexing_opt_in,
}: {
  share_id: string;
  scope: ShareScope;
  org_id: string | null;
  indexing_opt_in: boolean;
}): Promise<PublishedShare | undefined> {
  const { rows } = await pool().query(
    `
      UPDATE published_shares
      SET scope=$2,
          org_id=$3,
          indexing_opt_in=$4,
          updated_at=now()
      WHERE share_id=$1
      RETURNING *
    `,
    [share_id, scope, org_id, indexing_opt_in],
  );
  return rows[0] as PublishedShare | undefined;
}

export async function updatePublishedSharePublishStatus({
  share_id,
  status,
  error,
  share_region,
  latest_manifest_id,
  latest_manifest_hash,
  published_at,
  size_bytes,
}: {
  share_id: string;
  status?: SharePublishStatus | null;
  error?: string | null;
  share_region?: string | null;
  latest_manifest_id?: string | null;
  latest_manifest_hash?: string | null;
  published_at?: Date | null;
  size_bytes?: number | null;
}): Promise<PublishedShare | undefined> {
  const sets: string[] = [];
  const values: any[] = [share_id];
  let idx = 2;
  if (status !== undefined) {
    sets.push(`last_publish_status=$${idx++}`);
    values.push(status);
  }
  if (error !== undefined) {
    sets.push(`last_publish_error=$${idx++}`);
    values.push(error);
  }
  if (share_region !== undefined) {
    sets.push(`share_region=$${idx++}`);
    values.push(share_region);
  }
  if (latest_manifest_id !== undefined) {
    sets.push(`latest_manifest_id=$${idx++}`);
    values.push(latest_manifest_id);
  }
  if (latest_manifest_hash !== undefined) {
    sets.push(`latest_manifest_hash=$${idx++}`);
    values.push(latest_manifest_hash);
  }
  if (published_at !== undefined) {
    sets.push(`published_at=$${idx++}`);
    values.push(published_at);
  }
  if (size_bytes !== undefined) {
    sets.push(`size_bytes=$${idx++}`);
    values.push(size_bytes);
  }
  if (!sets.length) {
    const share = await getPublishedShareById(share_id);
    return share ?? undefined;
  }
  sets.push("updated_at=now()");
  const { rows } = await pool().query(
    `
      UPDATE published_shares
      SET ${sets.join(", ")}
      WHERE share_id=$1
      RETURNING *
    `,
    values,
  );
  return rows[0] as PublishedShare | undefined;
}

export async function getPublishedShareById(
  share_id: string,
): Promise<PublishedShare | undefined> {
  const { rows } = await pool().query(
    "SELECT * FROM published_shares WHERE share_id=$1",
    [share_id],
  );
  return rows[0] as PublishedShare | undefined;
}

export async function listPublishedSharesByProject(
  project_id: string,
): Promise<PublishedShare[]> {
  const { rows } = await pool().query(
    `
      SELECT *
      FROM published_shares
      WHERE project_id=$1
      ORDER BY updated_at DESC
    `,
    [project_id],
  );
  return rows as PublishedShare[];
}
