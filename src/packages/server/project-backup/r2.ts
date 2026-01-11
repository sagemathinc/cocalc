import getLogger from "@cocalc/backend/logger";

const logger = getLogger("server:project-backup:r2");

const R2_REGIONS = ["wnam", "enam", "weur", "eeur", "apac", "oc"] as const;
const ENSURE_TTL_MS = 60 * 60 * 1000;

let lastEnsureAt = 0;
let ensureInFlight: Promise<void> | null = null;
let warnedMissingToken = false;

type CloudflareResponse<T> = {
  success: boolean;
  errors?: { code?: number; message?: string }[];
  result?: T;
};

async function cloudflareRequest<T>(
  token: string,
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`https://api.cloudflare.com/client/v4/${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  if (!response.ok) {
    throw new Error(
      `cloudflare api failed: ${response.status} ${response.statusText}`,
    );
  }
  const payload = (await response.json()) as CloudflareResponse<T>;
  if (!payload.success) {
    const error = payload.errors?.[0]?.message ?? "unknown error";
    throw new Error(`cloudflare api failed: ${error}`);
  }
  if (payload.result == null) {
    throw new Error("cloudflare api returned no result");
  }
  return payload.result;
}

async function listBuckets(
  token: string,
  accountId: string,
): Promise<string[]> {
  const result = await cloudflareRequest<
    { name: string }[] | { buckets: { name: string }[] }
  >(token, `accounts/${accountId}/r2/buckets`);
  if (Array.isArray(result)) {
    return result.map((bucket) => bucket.name);
  }
  return result.buckets.map((bucket) => bucket.name);
}

async function createBucket(
  token: string,
  accountId: string,
  name: string,
  location: string,
) {
  await cloudflareRequest<{ name: string }>(token, `accounts/${accountId}/r2/buckets`, {
    method: "POST",
    body: JSON.stringify({ name, locationHint: location }),
  });
}

export async function ensureR2Buckets(opts: {
  accountId?: string;
  bucketPrefix?: string;
  apiToken?: string;
}) {
  const accountId = opts.accountId?.trim();
  const bucketPrefix = opts.bucketPrefix?.trim();
  const apiToken = opts.apiToken?.trim();
  if (!accountId || !bucketPrefix) return;
  if (!apiToken) {
    if (!warnedMissingToken) {
      warnedMissingToken = true;
      logger.warn("r2_api_token is missing; skipping bucket creation");
    }
    return;
  }
  const now = Date.now();
  if (now - lastEnsureAt < ENSURE_TTL_MS) return;
  if (ensureInFlight) return ensureInFlight;

  ensureInFlight = (async () => {
    try {
      const existing = new Set(await listBuckets(apiToken, accountId));
      for (const region of R2_REGIONS) {
        const name = `${bucketPrefix}-${region}`;
        if (existing.has(name)) continue;
        try {
          await createBucket(apiToken, accountId, name, region);
          logger.info("r2 bucket created", { name, region });
        } catch (err) {
          logger.warn("r2 bucket creation failed", {
            name,
            region,
            err: `${err}`,
          });
        }
      }
    } catch (err) {
      logger.warn("r2 bucket ensure failed", { err: `${err}` });
    } finally {
      lastEnsureAt = Date.now();
      ensureInFlight = null;
    }
  })();

  return ensureInFlight;
}
