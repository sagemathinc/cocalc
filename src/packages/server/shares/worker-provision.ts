import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import getLogger from "@cocalc/backend/logger";
import { db } from "@cocalc/database";
import {
  getServerSettings,
  resetServerSettingsCache,
} from "@cocalc/database/settings/server-settings";
import { ensureR2Buckets } from "@cocalc/server/project-backup/r2";
import { resolveShareJwtSecret } from "@cocalc/server/shares/jwt";
import { syncShareStaticAssets } from "@cocalc/server/shares/static-assets";
import { callback2 } from "@cocalc/util/async-utils";
import { DEFAULT_R2_REGION, R2_REGIONS } from "@cocalc/util/consts";

const logger = getLogger("server:shares:worker-provision");

const ENSURE_TTL_MS = 10 * 60 * 1000;
const SHARE_WORKER_BUNDLE_PATH = resolve(
  __dirname,
  "../../share-worker/dist/index.js",
);
const DEFAULT_COMPATIBILITY_DATE = "2024-10-01";

let ensureInFlight: Promise<void> | null = null;
let lastEnsureAt = 0;

type CloudflareResponse<T> = {
  success: boolean;
  errors?: { code?: number; message?: string }[];
  result?: T;
};

type WorkerBinding =
  | { name: string; type: "plain_text"; text: string }
  | { name: string; type: "secret_text"; text: string }
  | { name: string; type: "r2_bucket"; bucket_name: string };

type WorkerRoute = {
  id: string;
  pattern: string;
  script: string;
};

type ShareWorkerSettings = Awaited<ReturnType<typeof getServerSettings>>;

export async function ensureShareWorkerProvisioned({
  reason,
}: {
  reason?: string;
} = {}): Promise<void> {
  const settings = await getServerSettings();
  if (!settings.share_worker_enabled) return;

  const now = Date.now();
  if (shouldSkipProvision(settings, now)) {
    logger.debug("share worker provision skip", { reason });
    return;
  }
  if (ensureInFlight) return ensureInFlight;

  ensureInFlight = (async () => {
    try {
      await provisionShareWorker(settings, reason);
      await setShareWorkerState({
        share_worker_provisioned: "yes",
        share_worker_last_error: "",
        share_worker_last_provisioned_at: new Date().toISOString(),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : `${err}`;
      logger.warn("share worker provision failed", { reason, err: message });
      await setShareWorkerState({
        share_worker_provisioned: "no",
        share_worker_last_error: message,
      });
      throw err;
    } finally {
      lastEnsureAt = Date.now();
      ensureInFlight = null;
    }
  })();

  return ensureInFlight;
}

function shouldSkipProvision(settings: ShareWorkerSettings, now: number) {
  if (now - lastEnsureAt < ENSURE_TTL_MS) return true;
  if (!settings.share_worker_provisioned) return false;
  const last = Date.parse(settings.share_worker_last_provisioned_at ?? "");
  if (!Number.isFinite(last)) return false;
  return now - last < ENSURE_TTL_MS;
}

async function provisionShareWorker(
  settings: ShareWorkerSettings,
  reason?: string,
): Promise<void> {
  const shareDomain = normalizeDomain(settings.share_domain);
  if (!shareDomain) {
    throw new Error("share domain is not configured");
  }

  const primaryDomain = normalizeDomain(settings.dns);
  if (primaryDomain && shareDomain === primaryDomain) {
    throw new Error(
      "share domain must be different from the External Domain Name",
    );
  }

  const accountId = requireSetting(
    settings.share_worker_account_id,
    "share worker account id is not configured",
  );
  const zoneId = requireSetting(
    settings.share_worker_zone_id,
    "share worker zone id is not configured",
  );
  const apiToken = requireSetting(
    settings.share_worker_api_token,
    "share worker api token is not configured",
  );
  const workerName = requireSetting(
    settings.share_worker_name,
    "share worker name is not configured",
  );

  const r2AccountId = requireSetting(
    settings.r2_account_id,
    "R2 account id is not configured",
  );
  const bucketPrefix = requireSetting(
    settings.r2_bucket_prefix,
    "R2 bucket prefix is not configured",
  );
  const staticBucket =
    cleanSetting(settings.share_worker_static_bucket) ??
    `${bucketPrefix}-${DEFAULT_R2_REGION}`;

  const r2ApiToken = cleanSetting(settings.r2_api_token);
  if (r2ApiToken) {
    await ensureR2Buckets({
      accountId: r2AccountId,
      bucketPrefix,
      apiToken: r2ApiToken,
    });
  }

  const shareJwtSecret = await resolveShareJwtSecret();
  const bindings = buildWorkerBindings({
    bucketPrefix,
    staticBucket,
    shareJwtSecret,
    issuer: process.env.SHARE_JWT_ISSUER,
    audience: process.env.SHARE_JWT_AUDIENCE,
  });

  const script = await readShareWorkerBundle();
  await uploadWorkerScript({
    accountId,
    apiToken,
    workerName,
    script,
    bindings,
  });

  const routePattern =
    cleanSetting(settings.share_worker_route_pattern) ?? `${shareDomain}/*`;
  await ensureWorkerRoute({
    apiToken,
    zoneId,
    pattern: routePattern,
    workerName,
  });

  if (settings.share_worker_auto_sync_static_assets) {
    await syncShareStaticAssets({ reason });
  } else {
    logger.debug("share static asset sync disabled", { reason });
  }

  logger.info("share worker provisioned", {
    worker: workerName,
    route: routePattern,
    reason,
  });
}

function buildWorkerBindings({
  bucketPrefix,
  staticBucket,
  shareJwtSecret,
  issuer,
  audience,
}: {
  bucketPrefix: string;
  staticBucket: string;
  shareJwtSecret: string;
  issuer?: string;
  audience?: string;
}): WorkerBinding[] {
  const bindings: WorkerBinding[] = [
    {
      name: "SHARE_JWT_SECRET",
      type: "secret_text",
      text: shareJwtSecret,
    },
    {
      name: "SHARES_BUCKET",
      type: "r2_bucket",
      bucket_name: `${bucketPrefix}-${DEFAULT_R2_REGION}`,
    },
    {
      name: "SHARE_STATIC_BUCKET",
      type: "r2_bucket",
      bucket_name: staticBucket,
    },
  ];

  if (issuer) {
    bindings.push({
      name: "SHARE_JWT_ISSUER",
      type: "plain_text",
      text: issuer,
    });
  }
  if (audience) {
    bindings.push({
      name: "SHARE_JWT_AUDIENCE",
      type: "plain_text",
      text: audience,
    });
  }

  for (const region of R2_REGIONS) {
    bindings.push({
      name: `SHARES_BUCKET_${region.toUpperCase()}`,
      type: "r2_bucket",
      bucket_name: `${bucketPrefix}-${region}`,
    });
  }

  return bindings;
}

async function readShareWorkerBundle(): Promise<string> {
  try {
    return await readFile(SHARE_WORKER_BUNDLE_PATH, "utf8");
  } catch (err) {
    const detail = err instanceof Error ? err.message : `${err}`;
    throw new Error(
      `share worker bundle not found; run pnpm build in packages/share-worker (${detail})`,
    );
  }
}

async function uploadWorkerScript({
  accountId,
  apiToken,
  workerName,
  script,
  bindings,
}: {
  accountId: string;
  apiToken: string;
  workerName: string;
  script: string;
  bindings: WorkerBinding[];
}): Promise<void> {
  const mainModule = "share-worker.mjs";
  const metadata = {
    main_module: mainModule,
    compatibility_date: DEFAULT_COMPATIBILITY_DATE,
    bindings,
  };

  const form = new FormData();
  form.append(
    "metadata",
    new Blob([JSON.stringify(metadata)], { type: "application/json" }),
    "metadata.json",
  );
  form.append(
    mainModule,
    new Blob([script], { type: "application/javascript+module" }),
    mainModule,
  );

  await cloudflareRequest<unknown>(
    apiToken,
    `accounts/${accountId}/workers/scripts/${workerName}`,
    {
      method: "PUT",
      body: form,
    },
    true,
  );
}

async function ensureWorkerRoute({
  apiToken,
  zoneId,
  pattern,
  workerName,
}: {
  apiToken: string;
  zoneId: string;
  pattern: string;
  workerName: string;
}): Promise<void> {
  const routes =
    (await cloudflareRequest<WorkerRoute[]>(
      apiToken,
      `zones/${zoneId}/workers/routes`,
    )) ?? [];
  const existing = routes.find((route) => route.pattern === pattern);
  if (existing) {
    if (existing.script === workerName) return;
    await cloudflareRequest(
      apiToken,
      `zones/${zoneId}/workers/routes/${existing.id}`,
      {
        method: "PUT",
        body: JSON.stringify({ pattern, script: workerName }),
      },
      true,
    );
    return;
  }
  await cloudflareRequest(
    apiToken,
    `zones/${zoneId}/workers/routes`,
    {
      method: "POST",
      body: JSON.stringify({ pattern, script: workerName }),
    },
    true,
  );
}

async function cloudflareRequest<T>(
  token: string,
  path: string,
  options: RequestInit = {},
  allowEmptyResult = false,
): Promise<T | undefined> {
  const response = await fetch(`https://api.cloudflare.com/client/v4/${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...defaultHeaders(options),
    },
  });
  const text = await response.text();
  let payload: CloudflareResponse<T> | undefined;
  try {
    payload = text ? (JSON.parse(text) as CloudflareResponse<T>) : undefined;
  } catch {
    payload = undefined;
  }
  if (!response.ok) {
    const detail = payload?.errors?.[0]?.message;
    throw new Error(
      `cloudflare api failed: ${response.status} ${response.statusText}${
        detail ? ` (${detail})` : ""
      }`,
    );
  }
  if (!payload?.success) {
    const detail = payload?.errors?.[0]?.message ?? "unknown error";
    throw new Error(`cloudflare api failed: ${detail}`);
  }
  if (payload.result == null && !allowEmptyResult) {
    throw new Error("cloudflare api returned no result");
  }
  return payload.result;
}

function defaultHeaders(options: RequestInit): Record<string, string> {
  const headers: Record<string, string> = {};
  const isFormData =
    typeof FormData !== "undefined" && options.body instanceof FormData;
  if (!isFormData) {
    headers["Content-Type"] = "application/json";
  }
  return headers;
}

async function setShareWorkerState(
  values: Record<string, string>,
): Promise<void> {
  const database = db();
  for (const [name, value] of Object.entries(values)) {
    await callback2(database.set_server_setting, { name, value });
  }
  resetServerSettingsCache();
}

function normalizeDomain(value?: string | null): string | undefined {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return undefined;
  const withScheme = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    return url.hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

function requireSetting(
  value: string | null | undefined,
  message: string,
): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed) {
    throw new Error(message);
  }
  return trimmed;
}

function cleanSetting(value: string | null | undefined): string | undefined {
  const trimmed = (value ?? "").trim();
  return trimmed ? trimmed : undefined;
}
