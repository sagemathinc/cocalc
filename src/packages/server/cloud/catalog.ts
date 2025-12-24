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
  await pool().query(
    `
      INSERT INTO cloud_catalog_cache
        (id, provider, kind, scope, payload, fetched_at, ttl_seconds, etag)
      VALUES ($1,$2,$3,$4,$5,NOW(),$6,$7)
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
      entry.payload,
      entry.ttl_seconds,
      entry.etag ?? null,
    ],
  );
}

async function getGcpProjectId(): Promise<string> {
  const { google_cloud_service_account_json } = await getServerSettings();
  if (!google_cloud_service_account_json) {
    throw new Error("google_cloud_service_account_json is not configured");
  }
  const parsed = JSON.parse(google_cloud_service_account_json);
  if (!parsed.project_id) {
    throw new Error("GCP service account json missing project_id");
  }
  return parsed.project_id;
}

async function listGcpRegions(project: string) {
  const client = new compute.RegionsClient();
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

async function listGcpZones(project: string) {
  const client = new compute.ZonesClient();
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

async function listGcpMachineTypes(project: string, zone: string) {
  const client = new compute.MachineTypesClient();
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

async function listGcpGpuTypes(project: string, zone: string) {
  const client = new compute.AcceleratorTypesClient();
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
  const project = await getGcpProjectId();
  logger.info("refreshing GCP catalog", { project });

  const regions = await listGcpRegions(project);
  await upsertCatalog({
    id: catalogId("gcp", "regions", "global"),
    provider: "gcp",
    kind: "regions",
    scope: "global",
    payload: regions,
    ttl_seconds: GCP_TTLS.regions,
  });

  const zones = await listGcpZones(project);
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
    const machineTypes = await listGcpMachineTypes(project, zone.name);
    await upsertCatalog({
      id: catalogId("gcp", "machine_types", `zone/${zone.name}`),
      provider: "gcp",
      kind: "machine_types",
      scope: `zone/${zone.name}`,
      payload: machineTypes,
      ttl_seconds: GCP_TTLS.machine_types,
    });

    const gpus = await listGcpGpuTypes(project, zone.name);
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
