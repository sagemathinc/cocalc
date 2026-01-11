import getPool from "@cocalc/database/pool";
import type { Pool } from "pg";

export interface ProjectHostRecord {
  id: string;
  name?: string;
  region?: string;
  public_url?: string;
  internal_url?: string;
  ssh_server?: string;
  host_to_host_public_key?: string;
  sshpiperd_public_key?: string;
  status?: string;
  version?: string;
  capacity?: any;
  metadata?: any;
  last_seen?: Date;
}

function pool(): Pool {
  return getPool();
}

export async function upsertProjectHost({
  id,
  name,
  region,
  public_url,
  internal_url,
  ssh_server,
  status,
  version,
  capacity,
  metadata,
  last_seen,
  host_to_host_public_key,
  sshpiperd_public_key,
}: ProjectHostRecord): Promise<void> {
  const now = last_seen ?? new Date();
  const mergedMetadata = {
    ...(metadata ?? {}),
    ...(host_to_host_public_key ? { host_to_host_public_key } : {}),
    ...(sshpiperd_public_key ? { sshpiperd_public_key } : {}),
  };
  await pool().query(
    `
    INSERT INTO project_hosts
      (id, name, region, public_url, internal_url, ssh_server, status, version, capacity, metadata, last_seen, created, updated)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, NOW(), NOW())
    ON CONFLICT (id)
    DO UPDATE SET
      name = EXCLUDED.name,
      region = EXCLUDED.region,
      public_url = EXCLUDED.public_url,
      internal_url = EXCLUDED.internal_url,
      ssh_server = EXCLUDED.ssh_server,
      status = COALESCE(EXCLUDED.status, project_hosts.status),
      version = EXCLUDED.version,
      capacity = EXCLUDED.capacity,
      metadata = COALESCE(project_hosts.metadata, '{}'::jsonb) || COALESCE(EXCLUDED.metadata, '{}'::jsonb),
      last_seen = EXCLUDED.last_seen,
      updated = NOW()
    WHERE project_hosts.deleted IS NULL;
  `,
    [
      id,
      name ?? null,
      region ?? null,
      public_url ?? null,
      internal_url ?? null,
      ssh_server ?? null,
      status ?? null,
      version ?? null,
      capacity ?? null,
      mergedMetadata,
      now,
    ],
  );
}
