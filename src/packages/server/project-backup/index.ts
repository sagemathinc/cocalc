import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import { secrets } from "@cocalc/backend/data";
import getLogger from "@cocalc/backend/logger";
import getPool from "@cocalc/database/pool";
import { isValidUUID } from "@cocalc/util/misc";
import {
  DEFAULT_R2_REGION,
  mapCloudRegionToR2Region,
  parseR2Region,
} from "@cocalc/util/consts";
import { createBucket, R2BucketInfo } from "./r2";
import { ensureCopySchema } from "@cocalc/server/projects/copy-db";

const DEFAULT_BACKUP_TTL_SECONDS = 60 * 60 * 12; // 12 hours
const DEFAULT_BACKUP_ROOT = "rustic";
const BUCKET_PROVIDER = "r2";
const BUCKET_PURPOSE = "project-backups";

const logger = getLogger("server:project-backup");

function normalizeLocation(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  return normalized || null;
}

function pool() {
  return getPool();
}

async function getSiteSetting(name: string): Promise<string | undefined> {
  const { rows } = await pool().query<{ value: string | null }>(
    "SELECT value FROM server_settings WHERE name=$1",
    [name],
  );
  const value = rows[0]?.value ?? undefined;
  if (value == null || value === "") {
    return undefined;
  }
  return value;
}

type BucketRow = {
  id: string;
  name: string;
  provider: string | null;
  purpose: string | null;
  region: string | null;
  location: string | null;
  account_id: string | null;
  access_key_id: string | null;
  secret_access_key: string | null;
  endpoint: string | null;
  status: string | null;
};

async function loadBucketById(id: string): Promise<BucketRow | null> {
  const { rows } = await pool().query<BucketRow>(
    "SELECT id, name, provider, purpose, region, location, account_id, access_key_id, secret_access_key, endpoint, status FROM buckets WHERE id=$1",
    [id],
  );
  return rows[0] ?? null;
}

async function findBucketForRegion(region: string): Promise<BucketRow | null> {
  const { rows } = await pool().query<BucketRow>(
    "SELECT id, name, provider, purpose, region, location, account_id, access_key_id, secret_access_key, endpoint, status FROM buckets WHERE provider=$1 AND purpose=$2 AND region=$3 AND (status IS NULL OR status != 'disabled') ORDER BY created DESC LIMIT 1",
    [BUCKET_PROVIDER, BUCKET_PURPOSE, region],
  );
  const row = rows[0];
  if (!row) return null;
  const normalizedLocation = normalizeLocation(row.location ?? null);
  const normalizedRegion = normalizeLocation(row.region ?? null);
  const desiredStatus =
    normalizedLocation &&
    normalizedRegion &&
    normalizedLocation !== normalizedRegion
      ? "mismatch"
      : normalizedLocation
        ? "active"
        : "unknown";
  if (
    normalizedLocation !== row.location ||
    (row.status ?? "unknown") !== desiredStatus
  ) {
    await pool().query(
      "UPDATE buckets SET location=$2, status=$3, updated=NOW() WHERE id=$1",
      [row.id, normalizedLocation, desiredStatus],
    );
    return { ...row, location: normalizedLocation, status: desiredStatus };
  }
  return row;
}

async function insertBucketRecord({
  accountId,
  accessKey,
  secretKey,
  bucketPrefix,
  region,
  created,
}: {
  accountId: string;
  accessKey: string;
  secretKey: string;
  bucketPrefix: string;
  region: string;
  created?: R2BucketInfo;
}): Promise<BucketRow> {
  const name = `${bucketPrefix}-${region}`;
  const location = normalizeLocation(created?.location ?? null);
  const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
  const status =
    location && location !== region
      ? "mismatch"
      : location
        ? "active"
        : "unknown";
  await pool().query(
    "INSERT INTO buckets (id, provider, purpose, region, location, name, account_id, access_key_id, secret_access_key, endpoint, status, created, updated) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW()) ON CONFLICT (name) DO NOTHING",
    [
      BUCKET_PROVIDER,
      BUCKET_PURPOSE,
      region,
      location,
      name,
      accountId,
      accessKey,
      secretKey,
      endpoint,
      status,
    ],
  );
  const { rows } = await pool().query<BucketRow>(
    "SELECT id, name, provider, purpose, region, location, account_id, access_key_id, secret_access_key, endpoint, status FROM buckets WHERE name=$1 ORDER BY created DESC LIMIT 1",
    [name],
  );
  if (!rows[0]) {
    throw new Error(`failed to record bucket ${name}`);
  }
  return rows[0];
}

async function getOrCreateBucketForRegion(
  region: string,
): Promise<BucketRow | null> {
  const existing = await findBucketForRegion(region);
  if (existing) return existing;

  const accountId = await getSiteSetting("r2_account_id");
  const apiToken = await getSiteSetting("r2_api_token");
  const accessKey = await getSiteSetting("r2_access_key_id");
  const secretKey = await getSiteSetting("r2_secret_access_key");
  const bucketPrefix = await getSiteSetting("r2_bucket_prefix");
  if (!accountId || !accessKey || !secretKey || !bucketPrefix) {
    return null;
  }
  if (!apiToken) {
    logger.warn("r2_api_token is missing; cannot create bucket", { region });
    return null;
  }

  let created: R2BucketInfo | undefined;
  try {
    created = await createBucket(
      apiToken,
      accountId,
      `${bucketPrefix}-${region}`,
      region,
    );
    const createdLocation = normalizeLocation(created.location ?? null);
    if (createdLocation && createdLocation !== region) {
      logger.warn("r2 bucket location mismatch", {
        name: created.name,
        region,
        location: created.location,
      });
    } else {
      logger.info("r2 bucket created", { name: created.name, region });
    }
  } catch (err) {
    logger.warn("r2 bucket creation failed", { region, err: `${err}` });
  }

  return await insertBucketRecord({
    accountId,
    accessKey,
    secretKey,
    bucketPrefix,
    region,
    created,
  });
}

async function getProjectBucket(
  project_id: string,
  region: string,
): Promise<BucketRow | null> {
  const { rows } = await pool().query<{ backup_bucket_id: string | null }>(
    "SELECT backup_bucket_id FROM projects WHERE project_id=$1",
    [project_id],
  );
  const bucketId = rows[0]?.backup_bucket_id ?? null;
  if (bucketId) {
    const bucket = await loadBucketById(bucketId);
    if (bucket) return bucket;
  }
  const bucket = await getOrCreateBucketForRegion(region);
  if (!bucket) return null;
  if (bucketId) {
    await pool().query(
      "UPDATE projects SET backup_bucket_id=$2 WHERE project_id=$1",
      [project_id, bucket.id],
    );
  } else {
    await pool().query(
      "UPDATE projects SET backup_bucket_id=$2 WHERE project_id=$1 AND backup_bucket_id IS NULL",
      [project_id, bucket.id],
    );
  }
  return bucket;
}

async function resolveProjectRegion(
  project_id: string,
  hostRegion?: string | null,
): Promise<string> {
  const { rows } = await pool().query<{ region: string | null }>(
    "SELECT region FROM projects WHERE project_id=$1",
    [project_id],
  );
  if (!rows[0]) {
    throw new Error("project not found");
  }
  const stored = rows[0].region ?? null;
  const parsed = parseR2Region(stored);
  if (parsed) return parsed;

  const mapped = mapCloudRegionToR2Region(hostRegion ?? DEFAULT_R2_REGION);
  await pool().query("UPDATE projects SET region=$2 WHERE project_id=$1", [
    project_id,
    mapped,
  ]);
  return mapped;
}

async function getProjectBackupSecret(project_id: string): Promise<string> {
  const masterKey = await getBackupMasterKey();
  const { rows } = await pool().query<{ secret: string }>(
    "SELECT secret FROM project_backup_secrets WHERE project_id=$1",
    [project_id],
  );
  if (rows[0]?.secret) {
    const decoded = decryptBackupSecret(rows[0].secret, masterKey);
    if (!rows[0].secret.startsWith("v1:")) {
      const encrypted = encryptBackupSecret(decoded, masterKey);
      await pool().query(
        "UPDATE project_backup_secrets SET secret=$2, updated=NOW() WHERE project_id=$1",
        [project_id, encrypted],
      );
    }
    return decoded;
  }

  const secret = randomBytes(32).toString("base64url");
  const encrypted = encryptBackupSecret(secret, masterKey);
  await pool().query(
    "INSERT INTO project_backup_secrets (project_id, secret, created, updated) VALUES ($1, $2, NOW(), NOW()) ON CONFLICT (project_id) DO NOTHING",
    [project_id, encrypted],
  );
  const { rows: created } = await pool().query<{ secret: string }>(
    "SELECT secret FROM project_backup_secrets WHERE project_id=$1",
    [project_id],
  );
  if (!created[0]?.secret) {
    throw new Error("failed to create project backup secret");
  }
  return decryptBackupSecret(created[0].secret, masterKey);
}

const backupMasterKeyPath = join(secrets, "backup-master-key");
let backupMasterKey: Buffer | undefined;

async function getBackupMasterKey(): Promise<Buffer> {
  if (backupMasterKey) return backupMasterKey;
  let encoded = "";
  try {
    encoded = (await readFile(backupMasterKeyPath, "utf8")).trim();
  } catch {}
  if (!encoded) {
    encoded = randomBytes(32).toString("base64");
    try {
      await writeFile(backupMasterKeyPath, encoded, { mode: 0o600 });
    } catch (err) {
      throw new Error(`failed to write backup master key: ${err}`);
    }
  }
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) {
    throw new Error("invalid backup master key length");
  }
  backupMasterKey = key;
  return key;
}

function encryptBackupSecret(secret: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(secret, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

function decryptBackupSecret(encoded: string, key: Buffer): string {
  if (!encoded.startsWith("v1:")) return encoded;
  const [, ivB64, tagB64, dataB64] = encoded.split(":");
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("invalid backup secret format");
  }
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const data = Buffer.from(dataB64, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString(
    "utf8",
  );
}

export async function recordProjectBackup({
  host_id,
  project_id,
  time,
}: {
  host_id?: string;
  project_id: string;
  time?: Date | string;
}): Promise<void> {
  if (!host_id || !isValidUUID(host_id)) {
    throw new Error("invalid host_id");
  }
  if (!isValidUUID(project_id)) {
    throw new Error("invalid project_id");
  }
  await assertHostProjectAccess(host_id, project_id);

  let recordedAt = time ? new Date(time) : new Date();
  if (Number.isNaN(recordedAt.getTime())) {
    recordedAt = new Date();
  }
  await pool().query("UPDATE projects SET last_backup=$2 WHERE project_id=$1", [
    project_id,
    recordedAt,
  ]);
}

export async function getBackupConfig({
  host_id,
  project_id,
}: {
  host_id?: string;
  project_id?: string;
}): Promise<{ toml: string; ttl_seconds: number }> {
  if (!host_id || !isValidUUID(host_id)) {
    throw new Error("invalid host_id");
  }
  if (!project_id || !isValidUUID(project_id)) {
    throw new Error("invalid project_id");
  }
  const { rows } = await pool().query<{
    region: string | null;
  }>("SELECT region FROM project_hosts WHERE id=$1 AND deleted IS NULL", [
    host_id,
  ]);
  if (!rows[0]) {
    throw new Error("host not found");
  }

  await assertHostProjectAccess(host_id, project_id);

  const hostRegion = rows[0]?.region ?? null;
  const hostR2Region = mapCloudRegionToR2Region(
    hostRegion ?? DEFAULT_R2_REGION,
  );
  const projectR2Region = project_id
    ? await resolveProjectRegion(project_id, hostRegion)
    : hostR2Region;
  const bucket = project_id
    ? await getProjectBucket(project_id, projectR2Region)
    : await getOrCreateBucketForRegion(projectR2Region);
  if (!bucket) {
    return { toml: "", ttl_seconds: 0 };
  }
  const accountId =
    bucket.account_id ?? (await getSiteSetting("r2_account_id"));
  const accessKey =
    bucket.access_key_id ?? (await getSiteSetting("r2_access_key_id"));
  const secretKey =
    bucket.secret_access_key ?? (await getSiteSetting("r2_secret_access_key"));
  const endpoint =
    bucket.endpoint ??
    (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : undefined);
  if (!accountId || !accessKey || !secretKey || !endpoint) {
    return { toml: "", ttl_seconds: 0 };
  }

  const root = project_id
    ? `${DEFAULT_BACKUP_ROOT}/project-${project_id}`
    : `${DEFAULT_BACKUP_ROOT}/host-${host_id}`;
  const password = project_id ? await getProjectBackupSecret(project_id) : "";

  const toml = [
    "[repository]",
    'repository = "opendal:s3"',
    `password = \"${password}\"`,
    "",
    "[repository.options]",
    `endpoint = \"${endpoint}\"`,
    'region = "auto"',
    `bucket = \"${bucket.name}\"`,
    `root = \"${root}\"`,
    `access_key_id = \"${accessKey}\"`,
    `secret_access_key = \"${secretKey}\"`,
    "",
  ].join("\n");

  return { toml, ttl_seconds: DEFAULT_BACKUP_TTL_SECONDS };
}

async function assertHostProjectAccess(host_id: string, project_id: string) {
  const { rows } = await pool().query<{
    host_id: string | null;
  }>("SELECT host_id FROM projects WHERE project_id=$1", [project_id]);
  const currentHost = rows[0]?.host_id ?? null;
  if (!currentHost) {
    throw new Error("project not assigned to host");
  }
  if (currentHost === host_id) return;

  const { rows: moveRows } = await pool().query<{
    source_host_id: string | null;
    dest_host_id: string | null;
  }>(
    "SELECT source_host_id, dest_host_id FROM project_moves WHERE project_id=$1",
    [project_id],
  );
  const move = moveRows[0];
  if (
    move &&
    (move.source_host_id === host_id || move.dest_host_id === host_id)
  ) {
    return;
  }
  await ensureCopySchema();
  const { rows: copyRows } = await pool().query(
    `
      SELECT 1
      FROM project_copies pc
      JOIN projects p ON p.project_id = pc.dest_project_id
      WHERE pc.src_project_id=$1
        AND p.host_id=$2
        AND pc.status = ANY($3::text[])
      LIMIT 1
    `,
    [project_id, host_id, ["queued", "applying", "failed"]],
  );
  if (copyRows.length) {
    return;
  }
  throw new Error("project not assigned to host");
}
