import getLogger from "@cocalc/backend/logger";
import getPool from "@cocalc/database/pool";
import { getServerSettings } from "@cocalc/database/settings/server-settings";
import { fetchGcpCatalog } from "@cocalc/cloud";
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

const GCP_TTLS: Record<string, number> = {
  regions: 60 * 60 * 24 * 30,
  zones: 60 * 60 * 24 * 30,
  machine_types: 60 * 60 * 24 * 7,
  gpu_types: 60 * 60 * 24 * 7,
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

export async function refreshGcpCatalog() {
  const { projectId: project, credentials } = await getGcpAuth();
  logger.info("refreshing GCP catalog", { project });
  const catalog = await fetchGcpCatalog({ projectId: project, credentials });
  const pricing = await getGcpPricingData();
  const zonesMeta = pricing?.zones ?? {};

  if (Array.isArray(catalog.zones)) {
    for (const zone of catalog.zones) {
      const meta = zonesMeta[zone.name ?? ""];
      if (!meta) continue;
      zone.location = meta.location;
      zone.lowC02 = meta.lowC02;
    }
  }
  const regions = catalog.regions;
  await upsertCatalog({
    id: catalogId("gcp", "regions", "global"),
    provider: "gcp",
    kind: "regions",
    scope: "global",
    payload: regions,
    ttl_seconds: GCP_TTLS.regions,
  });

  const zones = catalog.zones;
  await upsertCatalog({
    id: catalogId("gcp", "zones", "global"),
    provider: "gcp",
    kind: "zones",
    scope: "global",
    payload: zones,
    ttl_seconds: GCP_TTLS.zones,
  });

  for (const zone of zones) {
    if (!zone?.name) continue;
    const machineTypes = catalog.machine_types_by_zone[zone.name] ?? [];
    await upsertCatalog({
      id: catalogId("gcp", "machine_types", `zone/${zone.name}`),
      provider: "gcp",
      kind: "machine_types",
      scope: `zone/${zone.name}`,
      payload: machineTypes,
      ttl_seconds: GCP_TTLS.machine_types,
    });

    const gpus = catalog.gpu_types_by_zone[zone.name] ?? [];
    await upsertCatalog({
      id: catalogId("gcp", "gpu_types", `zone/${zone.name}`),
      provider: "gcp",
      kind: "gpu_types",
      scope: `zone/${zone.name}`,
      payload: gpus,
      ttl_seconds: GCP_TTLS.gpu_types,
    });
  }
}

export async function refreshCloudCatalog() {
  await refreshGcpCatalog();
}

async function shouldRefreshGcpCatalog(): Promise<boolean> {
  const { rows } = await pool().query(
    `SELECT kind, fetched_at, ttl_seconds
       FROM cloud_catalog_cache
      WHERE provider = $1`,
    ["gcp"],
  );

  if (rows.length === 0) return true;

  let hasRegions = false;
  let hasZones = false;
  const now = Date.now();
  for (const row of rows) {
    if (row.kind === "regions") hasRegions = true;
    if (row.kind === "zones") hasZones = true;
    if (!row.fetched_at) return true;
    const ttlSeconds = Number(row.ttl_seconds ?? 0);
    if (ttlSeconds > 0) {
      const ageMs = now - new Date(row.fetched_at).getTime();
      if (ageMs > ttlSeconds * 1000) return true;
    }
  }

  if (!hasRegions || !hasZones) return true;
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

export function startCloudCatalogWorker(opts: { interval_ms?: number } = {}) {
  logger.info("startCloudCatalogWorker", opts);
  const interval_ms = opts.interval_ms ?? 1000 * 60 * 60 * 24;
  const tick = async () => {
    try {
      const needsRefresh = await shouldRefreshGcpCatalog();
      logger.info("startCloudCatalogWorker.tick", { needsRefresh });
      if (!needsRefresh) return;
      await withCatalogLock("gcp", refreshCloudCatalog);
    } catch (err) {
      logger.warn("cloud catalog refresh failed", { err });
    }
  };
  void tick();
  const timer = setInterval(tick, interval_ms);
  return () => clearInterval(timer);
}
