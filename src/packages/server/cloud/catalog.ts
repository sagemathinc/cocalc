import getLogger from "@cocalc/backend/logger";
import getPool from "@cocalc/database/pool";
import { getServerSettings } from "@cocalc/database/settings/server-settings";
import type { ProviderId } from "@cocalc/cloud";
import {
  getProviderEntry,
  listProviderEntries,
  type CatalogEntry as CloudCatalogEntry,
  type ProviderEntry,
} from "@cocalc/cloud";
import { getData as getGcpPricingData } from "@cocalc/gcloud-pricing-calculator";

const logger = getLogger("server:cloud:catalog");
const pool = () => getPool();

type CatalogEntry = {
  id: string;
  provider: string;
  kind: string;
  scope: string;
  payload: any;
  ttl_seconds: number;
  fetched_at?: Date;
  etag?: string;
};

function catalogId(provider: string, kind: string, scope: string) {
  return `${provider}/${kind}/${scope}`;
}

async function upsertCatalog(entry: CatalogEntry) {
  const payloadJson = JSON.stringify(entry.payload);
  await pool().query(
    `
      INSERT INTO cloud_catalog_cache
        (id, provider, kind, scope, payload, fetched_at, ttl_seconds, etag)
      VALUES ($1,$2,$3,$4,$5::jsonb,NOW(),$6,$7)
      ON CONFLICT (id) DO UPDATE
        SET payload=EXCLUDED.payload,
            fetched_at=EXCLUDED.fetched_at,
            ttl_seconds=EXCLUDED.ttl_seconds,
            etag=EXCLUDED.etag
    `,
    [
      entry.id,
      entry.provider,
      entry.kind,
      entry.scope,
      payloadJson,
      entry.ttl_seconds,
      entry.etag ?? null,
    ],
  );
}

type GcpAuth = { projectId: string; credentials: any };

async function getGcpAuth(): Promise<GcpAuth> {
  const { google_cloud_service_account_json } = await getServerSettings();
  if (!google_cloud_service_account_json) {
    logger.warn(
      "GCP catalog refresh skipped: missing google_cloud_service_account_json",
    );
    throw new Error("google_cloud_service_account_json is not configured");
  }
  const parsed = JSON.parse(google_cloud_service_account_json);
  if (!parsed.project_id) {
    throw new Error("GCP service account json missing project_id");
  }
  return { projectId: parsed.project_id, credentials: parsed };
}

async function getHyperstackApiKey(): Promise<string> {
  const { hyperstack_api_key } = await getServerSettings();
  if (!hyperstack_api_key) {
    logger.warn("Hyperstack catalog refresh skipped: missing hyperstack_api_key");
    throw new Error("hyperstack_api_key is not configured");
  }
  return hyperstack_api_key;
}

async function getLambdaApiKey(): Promise<string> {
  const { lambda_cloud_api_key } = await getServerSettings();
  if (!lambda_cloud_api_key) {
    logger.warn("Lambda catalog refresh skipped: missing lambda_cloud_api_key");
    throw new Error("lambda_cloud_api_key is not configured");
  }
  return lambda_cloud_api_key;
}

async function getCatalogFetchOptions(providerId: string): Promise<any> {
  if (providerId === "gcp") {
    return await getGcpAuth();
  }
  if (providerId === "hyperstack") {
    const apiKey = await getHyperstackApiKey();
    const { project_hosts_hyperstack_prefix } = await getServerSettings();
    return { apiKey, prefix: project_hosts_hyperstack_prefix };
  }
  if (providerId === "lambda") {
    const apiKey = await getLambdaApiKey();
    return { apiKey };
  }
  return {};
}

function applyCatalogTtl(
  entry: ProviderEntry,
  entries: CloudCatalogEntry[],
): CatalogEntry[] {
  const ttlSeconds = entry.catalog?.ttlSeconds ?? {};
  return entries.map((catalogEntry) => {
    const ttl = ttlSeconds[catalogEntry.kind];
    if (ttl == null) {
      logger.warn("missing catalog ttl", {
        provider: entry.id,
        kind: catalogEntry.kind,
      });
    }
    return {
      id: catalogId(entry.id, catalogEntry.kind, catalogEntry.scope),
      provider: entry.id,
      kind: catalogEntry.kind,
      scope: catalogEntry.scope,
      payload: catalogEntry.payload,
      ttl_seconds: ttl ?? 0,
    };
  });
}

function requiredCatalogKinds(entry: ProviderEntry): string[] {
  return Object.keys(entry.catalog?.ttlSeconds ?? {});
}

async function refreshCatalogForProvider(entry: ProviderEntry): Promise<void> {
  if (!entry.fetchCatalog || !entry.catalog) return;
  const providerId = entry.id;
  logger.info("refreshing cloud catalog", { provider: providerId });
  const fetchOpts = await getCatalogFetchOptions(providerId);
  const catalog = await entry.fetchCatalog(fetchOpts);

  if (providerId === "gcp" && Array.isArray(catalog?.zones)) {
    const pricing = await getGcpPricingData();
    const zonesMeta = pricing?.zones ?? {};
    for (const zone of catalog.zones) {
      const meta = zonesMeta[zone.name ?? ""];
      if (!meta) continue;
      zone.location = meta.location;
      zone.lowC02 = meta.lowC02;
    }
  }

  const entries = applyCatalogTtl(entry, entry.catalog.toEntries(catalog));
  for (const catalogEntry of entries) {
    await upsertCatalog(catalogEntry);
  }
}

async function shouldRefreshCatalog(entry: ProviderEntry): Promise<boolean> {
  if (!entry.catalog) return false;
  const { rows } = await pool().query(
    `SELECT kind,
            MAX(fetched_at) AS fetched_at,
            MAX(ttl_seconds) AS ttl_seconds,
            COUNT(*) AS count
       FROM cloud_catalog_cache
      WHERE provider = $1
      GROUP BY kind`,
    [entry.id],
  );

  if (rows.length === 0) return true;

  const requiredKinds = requiredCatalogKinds(entry);
  const now = Date.now();
  for (const kind of requiredKinds) {
    const row = rows.find((r) => r.kind === kind);
    if (!row || Number(row.count ?? 0) === 0) return true;
    if (!row.fetched_at) return true;
    const ttlSeconds = Number(row.ttl_seconds ?? 0);
    if (ttlSeconds > 0) {
      const ageMs = now - new Date(row.fetched_at).getTime();
      if (ageMs > ttlSeconds * 1000) return true;
    }
  }
  return false;
}

async function withCatalogLock<T>(
  provider: string,
  fn: () => Promise<T>,
): Promise<T | undefined> {
  const lockKey = `cloud_catalog_refresh:${provider}`;
  const { rows } = await pool().query(
    "SELECT pg_try_advisory_lock(hashtext($1)) AS locked",
    [lockKey],
  );
  if (!rows[0]?.locked) return undefined;
  try {
    return await fn();
  } finally {
    await pool().query("SELECT pg_advisory_unlock(hashtext($1))", [lockKey]);
  }
}

export async function refreshCloudCatalogNow(opts: {
  provider?: ProviderId;
} = {}) {
  const providers = opts.provider
    ? [getProviderEntry(opts.provider)].filter(
        (entry): entry is ProviderEntry => !!entry,
      )
    : listProviderEntries();

  for (const entry of providers) {
    if (!entry.fetchCatalog || !entry.catalog) continue;
    await withCatalogLock(entry.id, async () => {
      await refreshCatalogForProvider(entry);
    });
  }
}

export function startCloudCatalogWorker(opts: { interval_ms?: number } = {}) {
  logger.info("startCloudCatalogWorker", opts);
  const interval_ms = opts.interval_ms ?? 1000 * 60 * 60 * 24;
  const tick = async () => {
    try {
      const entries = listProviderEntries().filter(
        (entry) => entry.fetchCatalog && entry.catalog,
      );
      const needs = await Promise.all(
        entries.map(async (entry) => ({
          entry,
          needs: await shouldRefreshCatalog(entry),
        })),
      );
      logger.info("startCloudCatalogWorker.tick", {
        needs: needs.reduce<Record<string, boolean>>((acc, row) => {
          acc[row.entry.id] = row.needs;
          return acc;
        }, {}),
      });
      for (const row of needs) {
        if (!row.needs) continue;
        await withCatalogLock(row.entry.id, async () => {
          await refreshCatalogForProvider(row.entry);
        });
      }
    } catch (err) {
      logger.warn("cloud catalog refresh failed", { err });
    }
  };
  void tick();
  const timer = setInterval(tick, interval_ms);
  return () => clearInterval(timer);
}
