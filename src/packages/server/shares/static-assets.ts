/*
 * Syncs the share-viewer static bundle into the share static R2 bucket.
 * This keeps provisioning self-contained for dev/test so a developer can use
 * their own buckets without touching the global software bucket. In production
 * this can be replaced by an out-of-band publish pipeline for versioned assets
 * (disable via the share_worker_auto_sync_static_assets setting).
 */
import { createHash } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";

import mime from "mime-types";

import getLogger from "@cocalc/backend/logger";
import { createS3Client } from "@cocalc/backend/s3";
import { getServerSettings } from "@cocalc/database/settings/server-settings";
import { ensureR2Buckets } from "@cocalc/server/project-backup/r2";
import { mapParallelLimit } from "@cocalc/util/async-utils";
import { DEFAULT_R2_REGION } from "@cocalc/util/consts";
import { path as STATIC_PATH } from "@cocalc/static";

const logger = getLogger("server:shares:static-assets");

const EXCLUDE_PATTERNS = [/\.map$/, /^embed-.*\.js$/];
const MAX_PARALLEL_UPLOADS = 4;

type StaticAsset = {
  key: string;
  fullPath: string;
  size: number;
};

export async function syncShareStaticAssets({
  reason,
}: {
  reason?: string;
} = {}): Promise<void> {
  const settings = await getServerSettings();
  const accountId = cleanSetting(settings.r2_account_id);
  const accessKey = cleanSetting(settings.r2_access_key_id);
  const secretKey = cleanSetting(settings.r2_secret_access_key);
  const bucketPrefix = cleanSetting(settings.r2_bucket_prefix);
  if (!accountId || !accessKey || !secretKey || !bucketPrefix) {
    throw new Error("R2 settings are not configured");
  }

  const staticBucket =
    cleanSetting(settings.share_worker_static_bucket) ??
    `${bucketPrefix}-${DEFAULT_R2_REGION}`;

  const r2ApiToken = cleanSetting(settings.r2_api_token);
  if (r2ApiToken) {
    await ensureR2Buckets({
      accountId,
      bucketPrefix,
      apiToken: r2ApiToken,
    });
  }

  const staticRoot = resolveStaticRoot();
  const shareHtml = join(staticRoot, "share.html");
  await assertReadable(shareHtml);

  const assets = await listStaticAssets(staticRoot);
  logger.info("sync share static assets", {
    bucket: staticBucket,
    count: assets.length,
    reason,
  });

  const client = createS3Client({
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    bucket: staticBucket,
    access_key_id: accessKey,
    secret_access_key: secretKey,
  });

  let uploaded = 0;
  await mapParallelLimit(
    assets,
    async (asset) => {
      await uploadAsset(client, asset);
      uploaded += 1;
      if (uploaded % 100 === 0 || uploaded === assets.length) {
        logger.info("share static assets uploaded", {
          uploaded,
          total: assets.length,
        });
      }
    },
    MAX_PARALLEL_UPLOADS,
  );
}

async function listStaticAssets(root: string): Promise<StaticAsset[]> {
  const assets: StaticAsset[] = [];
  await walkStatic(root, root, assets);
  return assets;
}

async function walkStatic(
  root: string,
  dir: string,
  assets: StaticAsset[],
): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkStatic(root, fullPath, assets);
      continue;
    }
    if (!entry.isFile()) continue;
    const rel = toPosixPath(relative(root, fullPath));
    if (shouldExclude(rel)) continue;
    const fileStat = await stat(fullPath);
    assets.push({ key: rel, fullPath, size: fileStat.size });
  }
}

async function uploadAsset(
  client: ReturnType<typeof createS3Client>,
  asset: StaticAsset,
): Promise<void> {
  const contentType =
    (mime.lookup(asset.fullPath) as string) ?? "application/octet-stream";
  const contentHash = await hashFile(asset.fullPath);
  await client.putObject({
    key: asset.key,
    body: createReadStream(asset.fullPath),
    content_type: contentType,
    content_length: asset.size,
    content_hash: contentHash,
  });
}

function shouldExclude(key: string): boolean {
  return EXCLUDE_PATTERNS.some((pattern) => pattern.test(key));
}

function toPosixPath(value: string): string {
  return value.split(sep).join("/");
}

async function hashFile(fullPath: string): Promise<string> {
  const hash = createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(fullPath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve());
  });
  return hash.digest("hex");
}

async function assertReadable(fullPath: string): Promise<void> {
  try {
    const fileStat = await stat(fullPath);
    if (!fileStat.isFile()) {
      throw new Error("not a file");
    }
  } catch (err) {
    const detail = err instanceof Error ? err.message : `${err}`;
    throw new Error(
      `share.html not found in static assets; run a production static build (${detail})`,
    );
  }
}

function cleanSetting(value: string | null | undefined): string | undefined {
  const trimmed = (value ?? "").trim();
  return trimmed ? trimmed : undefined;
}

function resolveStaticRoot(): string {
  const primary = STATIC_PATH;
  if (existsSync(join(primary, "share.html"))) {
    return primary;
  }
  const bundled = join(__dirname, "..", "static");
  if (existsSync(join(bundled, "share.html"))) {
    return bundled;
  }
  return primary;
}
