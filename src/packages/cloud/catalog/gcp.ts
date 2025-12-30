import { v1 as compute } from "@google-cloud/compute";
import { map } from "awaiting";
import logger from "../logger";
import type {
  GcpCatalog,
  GcpGpuType,
  GcpImage,
  GcpMachineType,
  GcpRegion,
  GcpZone,
  CatalogEntry,
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
  images?: GcpImage[];
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

  const images = opts.images?.length
    ? latestImagesByFamily(opts.images)
        .filter((img) => !img.deprecated?.state)
        .filter((img) => {
          const version = ubuntuVersionCode(img.family ?? img.name ?? "");
          return version != null && version >= 2204;
        })
    : [];

  return {
    regions,
    zones,
    machine_types_by_zone: opts.machine_types_by_zone,
    gpu_types_by_zone: opts.gpu_types_by_zone,
    images,
  };
}

export function gcpCatalogEntries(catalog: GcpCatalog): CatalogEntry[] {
  const entries: CatalogEntry[] = [
    {
      kind: "regions",
      scope: "global",
      payload: catalog.regions,
    },
    {
      kind: "zones",
      scope: "global",
      payload: catalog.zones,
    },
  ];

  for (const zone of catalog.zones) {
    if (!zone?.name) continue;
    entries.push({
      kind: "machine_types",
      scope: `zone/${zone.name}`,
      payload: catalog.machine_types_by_zone[zone.name] ?? [],
    });
    entries.push({
      kind: "gpu_types",
      scope: `zone/${zone.name}`,
      payload: catalog.gpu_types_by_zone[zone.name] ?? [],
    });
  }

  entries.push({
    kind: "images",
    scope: "global",
    payload: catalog.images ?? [],
  });

  return entries;
}

function safeDiskGb(value: unknown): string | null {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return null;
  if (num < 0 || num > 10000) {
    logger.warn("GCP image diskSizeGb out of expected range", { value: num });
    return null;
  }
  return String(Math.trunc(num));
}

function ubuntuVersionCode(name?: string | null): number | undefined {
  if (!name) return undefined;
  const match = name.match(/ubuntu-.*?(\d{2})(\d{2})/i);
  if (!match) return undefined;
  return Number(`${match[1]}${match[2]}`);
}

function latestImagesByFamily(images: GcpImage[]): GcpImage[] {
  const byFamily = new Map<string, GcpImage>();
  for (const img of images) {
    const family = img.family ?? img.name ?? "";
    if (!family) continue;
    const current = byFamily.get(family);
    if (!current) {
      byFamily.set(family, img);
      continue;
    }
    const currentTs = Date.parse(current.creationTimestamp ?? "");
    const nextTs = Date.parse(img.creationTimestamp ?? "");
    if (!Number.isFinite(currentTs) || !Number.isFinite(nextTs)) {
      if ((img.name ?? "") > (current.name ?? "")) {
        byFamily.set(family, img);
      }
      continue;
    }
    if (nextTs > currentTs) {
      byFamily.set(family, img);
    }
  }
  return Array.from(byFamily.values());
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

async function listImages(
  opts: GcpCatalogOptions,
  project: string,
  gpuReady: boolean,
): Promise<GcpImage[]> {
  const client = new compute.ImagesClient({
    projectId: opts.projectId,
    credentials: opts.credentials,
  });
  const images: GcpImage[] = [];
  for await (const img of client.listAsync({ project })) {
    images.push({
      project,
      name: img.name,
      family: img.family,
      selfLink: img.selfLink,
      architecture: img.architecture,
      status: img.status,
      deprecated: img.deprecated,
      diskSizeGb:
        img.diskSizeGb == null ? null : safeDiskGb(img.diskSizeGb),
      creationTimestamp: img.creationTimestamp,
      gpuReady,
    });
  }
  await client.close();
  return images;
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

  const images = [
    ...(await listImages(opts, "ubuntu-os-cloud", false)),
    ...(await listImages(opts, "ubuntu-os-accelerator-images", true)),
  ];
  const filteredImages = latestImagesByFamily(images)
    .filter((img) => !img.deprecated?.state)
    .filter((img) => {
      const version = ubuntuVersionCode(img.family ?? img.name ?? "");
      return version != null && version >= 2204;
    });

  const catalog = normalizeGcpCatalog({
    regions,
    zones,
    machine_types_by_zone,
    gpu_types_by_zone,
    images: filteredImages,
  });
  logger.info("fetchGcpCatalog done", {
    regions: catalog.regions.length,
    zones: catalog.zones.length,
  });
  return catalog;
}
