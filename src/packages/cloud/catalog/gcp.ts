import { v1 as compute } from "@google-cloud/compute";
import { map } from "awaiting";
import logger from "../logger";
import type {
  GcpCatalog,
  GcpGpuType,
  GcpMachineType,
  GcpRegion,
  GcpZone,
} from "./types";

export type GcpCatalogOptions = {
  projectId: string;
  credentials: any;
};

export function shortName(url?: string | null): string | undefined {
  if (!url) return undefined;
  const idx = url.lastIndexOf("/");
  if (idx === -1) return url;
  return url.slice(idx + 1);
}

type GcpRegionRaw = {
  name?: string | null;
  status?: string | null;
  zones?: string[] | null;
};

type GcpZoneRaw = {
  name?: string | null;
  status?: string | null;
  region?: string | null;
  location?: string | null;
  lowC02?: boolean | null;
};

export function normalizeGcpCatalog(opts: {
  regions: GcpRegionRaw[];
  zones: GcpZoneRaw[];
  machine_types_by_zone: Record<string, GcpMachineType[]>;
  gpu_types_by_zone: Record<string, GcpGpuType[]>;
}): GcpCatalog {
  const regions: GcpRegion[] = opts.regions.map((region) => ({
    name: region.name ?? "",
    status: region.status,
    zones: (region.zones ?? [])
      .map((z) => shortName(z) ?? "")
      .filter(Boolean),
  }));

  const zones: GcpZone[] = opts.zones.map((zone) => ({
    name: zone.name ?? "",
    status: zone.status,
    region: shortName(zone.region),
    location: zone.location ?? undefined,
    lowC02: zone.lowC02 ?? undefined,
  }));

  return {
    regions,
    zones,
    machine_types_by_zone: opts.machine_types_by_zone,
    gpu_types_by_zone: opts.gpu_types_by_zone,
  };
}

async function listRegions(opts: GcpCatalogOptions): Promise<GcpRegionRaw[]> {
  const client = new compute.RegionsClient({
    projectId: opts.projectId,
    credentials: opts.credentials,
  });
  const regions: GcpRegionRaw[] = [];
  for await (const region of client.listAsync({ project: opts.projectId })) {
    regions.push({
      name: region.name ?? "",
      status: region.status,
      zones: region.zones ?? [],
    });
  }
  await client.close();
  return regions;
}

async function listZones(opts: GcpCatalogOptions): Promise<GcpZoneRaw[]> {
  const client = new compute.ZonesClient({
    projectId: opts.projectId,
    credentials: opts.credentials,
  });
  const zones: GcpZoneRaw[] = [];
  for await (const zone of client.listAsync({ project: opts.projectId })) {
    zones.push({
      name: zone.name ?? "",
      status: zone.status,
      region: zone.region,
    });
  }
  await client.close();
  return zones;
}

async function listMachineTypes(
  opts: GcpCatalogOptions,
  zone: string,
): Promise<GcpMachineType[]> {
  const client = new compute.MachineTypesClient({
    projectId: opts.projectId,
    credentials: opts.credentials,
  });
  const types: GcpMachineType[] = [];
  for await (const mt of client.listAsync({ project: opts.projectId, zone })) {
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

async function listGpuTypes(
  opts: GcpCatalogOptions,
  zone: string,
): Promise<GcpGpuType[]> {
  const client = new compute.AcceleratorTypesClient({
    projectId: opts.projectId,
    credentials: opts.credentials,
  });
  const gpus: GcpGpuType[] = [];
  for await (const gpu of client.listAsync({ project: opts.projectId, zone })) {
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

export async function fetchGcpCatalog(opts: GcpCatalogOptions): Promise<GcpCatalog> {
  logger.info("fetchGcpCatalog start", { projectId: opts.projectId });
  const regions = await listRegions(opts);
  logger.debug("fetchGcpCatalog regions", { count: regions.length });
  const zones = await listZones(opts);
  logger.debug("fetchGcpCatalog zones", { count: zones.length });
  const zoneNames = zones.map((z) => z.name ?? "").filter(Boolean);

  const machine_types_by_zone: Record<string, GcpMachineType[]> = {};
  const gpu_types_by_zone: Record<string, GcpGpuType[]> = {};

  const MAX_PARALLEL = 15;

  await map(
    zoneNames,
    MAX_PARALLEL,
    async (zone) => {
      logger.debug("fetchGcpCatalog zone details", { zone });
      const [machineTypes, gpus] = await Promise.all([
        listMachineTypes(opts, zone),
        listGpuTypes(opts, zone),
      ]);
      machine_types_by_zone[zone] = machineTypes;
      gpu_types_by_zone[zone] = gpus;
    },
  );

  const catalog = normalizeGcpCatalog({
    regions,
    zones,
    machine_types_by_zone,
    gpu_types_by_zone,
  });
  logger.info("fetchGcpCatalog done", {
    regions: catalog.regions.length,
    zones: catalog.zones.length,
  });
  return catalog;
}
