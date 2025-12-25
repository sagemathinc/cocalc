import { v1 as compute } from "@google-cloud/compute";
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
  description?: string | null;
  zones?: string[] | null;
};

type GcpZoneRaw = {
  name?: string | null;
  status?: string | null;
  region?: string | null;
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
    description: region.description,
    zones: (region.zones ?? [])
      .map((z) => shortName(z) ?? "")
      .filter(Boolean),
  }));

  const zones: GcpZone[] = opts.zones.map((zone) => ({
    name: zone.name ?? "",
    status: zone.status,
    region: shortName(zone.region),
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
      description: region.description,
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
  const regions = await listRegions(opts);
  const zones = await listZones(opts);
  const zoneNames = zones.map((z) => z.name ?? "").filter(Boolean);

  const machine_types_by_zone: Record<string, GcpMachineType[]> = {};
  const gpu_types_by_zone: Record<string, GcpGpuType[]> = {};

  for (const zone of zoneNames) {
    machine_types_by_zone[zone] = await listMachineTypes(opts, zone);
    gpu_types_by_zone[zone] = await listGpuTypes(opts, zone);
  }

  return normalizeGcpCatalog({
    regions,
    zones,
    machine_types_by_zone,
    gpu_types_by_zone,
  });
}
