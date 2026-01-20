import getPool from "@cocalc/database/pool";
import {
  DEFAULT_R2_REGION,
  mapCloudRegionToR2Region,
} from "@cocalc/util/consts";
import { ensureR2Buckets } from "@cocalc/server/project-backup/r2";
import type { ShareBucketConfig } from "@cocalc/conat/files/file-server";

const BUCKET_PROVIDER = "r2";
const BUCKET_PURPOSE = "shares";

async function getSiteSetting(name: string): Promise<string | undefined> {
  const { rows } = await getPool().query<{ value: string | null }>(
    "SELECT value FROM server_settings WHERE name=$1",
    [name],
  );
  const value = rows[0]?.value ?? undefined;
  if (value == null || value === "") {
    return undefined;
  }
  return value;
}

async function getProjectHostRegion(
  project_id: string,
): Promise<string | null> {
  const { rows } = await getPool().query<{ host_id: string | null }>(
    "SELECT host_id FROM projects WHERE project_id=$1",
    [project_id],
  );
  const host_id = rows[0]?.host_id ?? null;
  if (!host_id) return null;
  const { rows: hostRows } = await getPool().query<{ region: string | null }>(
    "SELECT region FROM project_hosts WHERE id=$1 AND deleted IS NULL",
    [host_id],
  );
  return hostRows[0]?.region ?? null;
}

export async function resolveShareBucketConfig({
  project_id,
}: {
  project_id: string;
}): Promise<ShareBucketConfig> {
  const accountId = await getSiteSetting("r2_account_id");
  const accessKey = await getSiteSetting("r2_access_key_id");
  const secretKey = await getSiteSetting("r2_secret_access_key");
  const bucketPrefix = await getSiteSetting("r2_bucket_prefix");
  const apiToken = await getSiteSetting("r2_api_token");

  if (!accountId || !accessKey || !secretKey || !bucketPrefix) {
    throw new Error("R2 settings are not configured");
  }

  const hostRegion = await getProjectHostRegion(project_id);
  const region = mapCloudRegionToR2Region(hostRegion ?? DEFAULT_R2_REGION);
  const bucket = `${bucketPrefix}-${region}`;
  const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;

  if (apiToken) {
    await ensureR2Buckets({
      accountId,
      bucketPrefix,
      apiToken,
    });
  }

  await getPool().query(
    `
      INSERT INTO buckets
        (id, provider, purpose, region, name, account_id, access_key_id, secret_access_key, endpoint, status, created, updated)
      VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
      ON CONFLICT (name) DO NOTHING
    `,
    [
      BUCKET_PROVIDER,
      BUCKET_PURPOSE,
      region,
      bucket,
      accountId,
      accessKey,
      secretKey,
      endpoint,
      "unknown",
    ],
  );

  return {
    endpoint,
    bucket,
    region,
    access_key_id: accessKey,
    secret_access_key: secretKey,
  };
}
