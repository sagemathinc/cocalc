import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import { secrets } from "@cocalc/backend/data";
import getPool from "@cocalc/database/pool";
import { isValidUUID } from "@cocalc/util/misc";
import { ensureR2Buckets } from "./r2";

const DEFAULT_BACKUP_TTL_SECONDS = 60 * 60 * 12; // 12 hours
const DEFAULT_BACKUP_ROOT = "rustic";

type R2Region = "wnam" | "enam" | "weur" | "eeur" | "apac" | "oc";

function resolveR2Region(region: string): R2Region {
  const value = region.trim().toLowerCase();
  if (!value) {
    return "wnam";
  }
  if (/^us-(west|south)/.test(value) || value.includes("canada")) {
    return "wnam";
  }
  if (/^us-(east|central|north)/.test(value) || value.startsWith("us-")) {
    return "enam";
  }
  if (value.startsWith("eu-") || value.includes("norway")) {
    return "weur";
  }
  if (value.startsWith("me-")) {
    return "eeur";
  }
  if (value.startsWith("ap-") || value.startsWith("asia") || value.includes("apac")) {
    return "apac";
  }
  if (value.startsWith("oc") || value.includes("australia")) {
    return "oc";
  }
  return "wnam";
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
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
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
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

export async function getBackupConfig({
  account_id,
  host_id,
  project_id,
}: {
  account_id?: string;
  host_id: string;
  project_id?: string;
}): Promise<{ toml: string; ttl_seconds: number }> {
  if (account_id) {
    throw new Error("not authorized");
  }
  if (!isValidUUID(host_id)) {
    throw new Error("invalid host_id");
  }
  if (project_id != null && !isValidUUID(project_id)) {
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

  const accountId = await getSiteSetting("r2_account_id");
  const apiToken = await getSiteSetting("r2_api_token");
  const accessKey = await getSiteSetting("r2_access_key_id");
  const secretKey = await getSiteSetting("r2_secret_access_key");
  const bucketPrefix = await getSiteSetting("r2_bucket_prefix");
  if (!accountId || !accessKey || !secretKey || !bucketPrefix) {
    return { toml: "", ttl_seconds: 0 };
  }
  void ensureR2Buckets({ accountId, bucketPrefix, apiToken });

  const hostRegion = rows[0]?.region ?? "";
  const r2Region = resolveR2Region(hostRegion);
  const bucket = `${bucketPrefix}-${r2Region}`;
  const root = project_id
    ? `${DEFAULT_BACKUP_ROOT}/project-${project_id}`
    : `${DEFAULT_BACKUP_ROOT}/host-${host_id}`;
  const password = project_id ? await getProjectBackupSecret(project_id) : "";

  const toml = [
    "[repository]",
    "repository = \"opendal:s3\"",
    `password = \"${password}\"`,
    "",
    "[repository.options]",
    `endpoint = \"https://${accountId}.r2.cloudflarestorage.com\"`,
    "region = \"auto\"",
    `bucket = \"${bucket}\"`,
    `root = \"${root}\"`,
    `access_key_id = \"${accessKey}\"`,
    `secret_access_key = \"${secretKey}\"`,
    "",
  ].join("\n");

  return { toml, ttl_seconds: DEFAULT_BACKUP_TTL_SECONDS };
}
