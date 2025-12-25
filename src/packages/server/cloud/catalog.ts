import getLogger from "@cocalc/backend/logger";
import getPool from "@cocalc/database/pool";
import { getServerSettings } from "@cocalc/database/settings/server-settings";
import { v1 as compute } from "@google-cloud/compute";

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
    logger.warn("GCP catalog refresh skipped: missing google_cloud_service_account_json");
    throw new Error("google_cloud_service_account_json is not configured");
  }
  const parsed = JSON.parse(google_cloud_service_account_json);
  if (!parsed.project_id) {
    throw new Error("GCP service account json missing project_id");
  }
  return { projectId: parsed.project_id, credentials: parsed };
}

async function listGcpRegions(project: string, creds: any) {
  const client = new compute.RegionsClient(creds);
  const regions: {
    name?: string | null;
    status?: string | null;
    zones?: string[] | null;
  }[] = [];
  for await (const region of client.listAsync({ project })) {
    regions.push({
      name: region.name,
      status: region.status,
      zones: region.zones,
    });
  }
  await client.close();
  return regions;
}

async function listGcpZones(project: string, creds: any) {
  const client = new compute.ZonesClient(creds);
  const zones: {
    name?: string | null;
    status?: string | null;
    region?: string | null;
  }[] = [];
  for await (const zone of client.listAsync({ project })) {
    zones.push({
      name: zone.name,
      status: zone.status,
      region: zone.region,
    });
  }
  await client.close();
  return zones;
}

async function listGcpMachineTypes(project: string, zone: string, creds: any) {
  const client = new compute.MachineTypesClient(creds);
  const types: {
    name?: string | null;
    guestCpus?: number | null;
    memoryMb?: number | null;
    isSharedCpu?: boolean | null;
    deprecated?: any;
  }[] = [];
  for await (const mt of client.listAsync({ project, zone })) {
    types.push({
      name: mt.name,
      guestCpus: mt.guestCpus,
      memoryMb: mt.memoryMb,
      isSharedCpu: mt.isSharedCpu,
      deprecated: mt.deprecated,
    });
  }
  await client.close();
  return types;
}

async function listGcpGpuTypes(project: string, zone: string, creds: any) {
  const client = new compute.AcceleratorTypesClient(creds);
  const gpus: {
    name?: string | null;
    maximumCardsPerInstance?: number | null;
    description?: string | null;
    deprecated?: any;
  }[] = [];
  for await (const gpu of client.listAsync({ project, zone })) {
    gpus.push({
      name: gpu.name,
      maximumCardsPerInstance: gpu.maximumCardsPerInstance,
      description: gpu.description,
      deprecated: gpu.deprecated,
    });
  }
  await client.close();
  return gpus;
}

export async function refreshGcpCatalog() {
  const { projectId: project, credentials } = await getGcpAuth();
  const creds = { credentials, projectId: project };
  logger.info("refreshing GCP catalog", { project });

  const regions = await listGcpRegions(project, creds);
  await upsertCatalog({
    id: catalogId("gcp", "regions", "global"),
    provider: "gcp",
    kind: "regions",
    scope: "global",
    payload: regions,
    ttl_seconds: GCP_TTLS.regions,
  });

  const zones = await listGcpZones(project, creds);
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
    const machineTypes = await listGcpMachineTypes(project, zone.name, creds);
    await upsertCatalog({
      id: catalogId("gcp", "machine_types", `zone/${zone.name}`),
      provider: "gcp",
      kind: "machine_types",
      scope: `zone/${zone.name}`,
      payload: machineTypes,
      ttl_seconds: GCP_TTLS.machine_types,
    });

    const gpus = await listGcpGpuTypes(project, zone.name, creds);
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

export function startCloudCatalogWorker(opts: { interval_ms?: number } = {}) {
  logger.info("startCloudCatalogWorker", opts);
  const interval_ms = opts.interval_ms ?? 1000 * 60 * 60 * 24;
  const tick = async () => {
    try {
      await refreshCloudCatalog();
    } catch (err) {
      logger.warn("cloud catalog refresh failed", { err });
    }
  };
  void tick();
  const timer = setInterval(tick, interval_ms);
  return () => clearInterval(timer);
}
