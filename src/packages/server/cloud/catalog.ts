import getLogger from "@cocalc/backend/logger";
import getPool from "@cocalc/database/pool";
import { getServerSettings } from "@cocalc/database/settings/server-settings";
import type { ProviderId } from "@cocalc/cloud";
import {
  type CatalogEntry as CloudCatalogEntry,
  type ProviderEntry,
} from "@cocalc/cloud";
import {
  getServerProvider,
  listServerProviders,
  type ServerProviderEntry,
} from "./providers";

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

async function refreshCatalogForProvider(
  provider: ServerProviderEntry,
): Promise<void> {
  const entry = provider.entry;
  if (!entry.fetchCatalog || !entry.catalog) return;
  logger.info("refreshing cloud catalog", { provider: provider.id });
  const settings = await getServerSettings();
  const fetchOpts = provider.getCatalogFetchOptions
    ? await provider.getCatalogFetchOptions(settings)
    : {};
  const catalog = await entry.fetchCatalog(fetchOpts);
  if (provider.postProcessCatalog) {
    await provider.postProcessCatalog(catalog);
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
    ? [getServerProvider(opts.provider)].filter(
        (entry): entry is ServerProviderEntry => !!entry,
      )
    : listServerProviders();

  for (const provider of providers) {
    if (!provider.entry.fetchCatalog || !provider.entry.catalog) continue;
    await withCatalogLock(provider.id, async () => {
      await refreshCatalogForProvider(provider);
    });
  }
}

export function startCloudCatalogWorker(opts: { interval_ms?: number } = {}) {
  logger.info("startCloudCatalogWorker", opts);
  const interval_ms = opts.interval_ms ?? 1000 * 60 * 60 * 24;
  const tick = async () => {
    try {
      const providers = listServerProviders().filter(
        (provider) => provider.entry.fetchCatalog && provider.entry.catalog,
      );
      const needs = await Promise.all(
        providers.map(async (provider) => ({
          provider,
          needs: await shouldRefreshCatalog(provider.entry),
        })),
      );
      logger.info("startCloudCatalogWorker.tick", {
        needs: needs.reduce<Record<string, boolean>>((acc, row) => {
          acc[row.provider.id] = row.needs;
          return acc;
        }, {}),
      });
      for (const row of needs) {
        if (!row.needs) continue;
        await withCatalogLock(row.provider.id, async () => {
          await refreshCatalogForProvider(row.provider);
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
