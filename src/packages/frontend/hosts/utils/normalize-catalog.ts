import type { HostCatalog } from "@cocalc/conat/hub/api/hosts";
import { LAMBDA_REGIONS } from "../constants";

export type CatalogSummary = {
  gcp: {
    regions: {
      name?: string;
      location?: string;
      lowC02?: boolean;
      zones: string[];
      sampleMachineTypes: {
        name?: string;
        guestCpus?: number;
        memoryMb?: number;
      }[];
      sampleGpuTypes: {
        name?: string;
        description?: string;
        maximumCardsPerInstance?: number;
      }[];
    }[];
    region_groups: Record<string, string[]>;
    images: {
      name?: string;
      family?: string;
      selfLink?: string;
      architecture?: string;
      gpuReady?: boolean;
    }[];
  };
  hyperstack: {
    regions: { name: string }[];
    flavors: {
      name: string;
      region?: string | null;
      cpu?: number;
      ram?: number;
      gpu?: string;
      gpu_count?: number;
    }[];
  };
  lambda?: {
    regions: { name: string }[];
    instance_types: {
      name: string;
      vcpus?: number;
      memory_gib?: number;
      gpus?: number;
      regions?: string[];
    }[];
    images: {
      id?: string;
      name?: string;
      family?: string;
      architecture?: string;
      region?: string;
    }[];
  };
  nebius?: {
    regions: { name: string }[];
    instance_types: {
      name: string;
      platform?: string;
      platform_label?: string;
      vcpus?: number;
      memory_gib?: number;
      gpus?: number;
      gpu_label?: string;
    }[];
    images: {
      id?: string;
      name?: string;
      family?: string;
      version?: string;
      architecture?: string;
      recommended_platforms?: string[];
    }[];
  };
};

const limit = <T,>(items: T[], n = 5) => items.slice(0, n);

export const buildCatalogSummary = ({
  catalog,
  lambdaRegionsFromCatalog,
  lambdaEnabled,
}: {
  catalog?: HostCatalog;
  lambdaRegionsFromCatalog: string[];
  lambdaEnabled: boolean;
}): CatalogSummary | undefined => {
  if (!catalog) return undefined;
  const zonesByName = new Map(catalog.zones?.map((z) => [z.name, z]) ?? []);
  const regionGroups: Record<string, string[]> = {};
  const gcpRegions = (catalog.regions ?? []).map((r) => {
    const zone = r.zones?.[0];
    const zoneDetails = zone ? zonesByName.get(zone) : undefined;
    const machineTypes = limit(
      catalog.machine_types_by_zone?.[zone ?? ""] ?? [],
      5,
    ).map((m) => ({
      name: m.name,
      guestCpus: m.guestCpus,
      memoryMb: m.memoryMb,
    }));
    const gpuTypes = limit(
      catalog.gpu_types_by_zone?.[zone ?? ""] ?? [],
      5,
    ).map((g) => ({
      name: g.name ?? undefined,
      description: g.description ?? undefined,
      maximumCardsPerInstance: g.maximumCardsPerInstance ?? undefined,
    }));
    return {
      name: r.name,
      location: zoneDetails?.location ?? undefined,
      lowC02: zoneDetails?.lowC02 ?? undefined,
      zones: limit(r.zones ?? [], 3),
      sampleMachineTypes: machineTypes.map((m) => ({
        name: m.name ?? undefined,
        guestCpus: m.guestCpus ?? undefined,
        memoryMb: m.memoryMb ?? undefined,
      })),
      sampleGpuTypes: gpuTypes,
    };
  });
  for (const r of gcpRegions) {
    const name = r.name || "";
    let group = "any";
    if (name.startsWith("us-west")) group = "us-west";
    else if (name.startsWith("us-east")) group = "us-east";
    else if (name.startsWith("europe")) group = "eu-west";
    else if (name.startsWith("asia")) group = "asia";
    else if (name.startsWith("australia")) group = "australia";
    else if (name.startsWith("southamerica")) group = "southamerica";
    regionGroups[group] ??= [];
    regionGroups[group].push(name);
  }
  const gcpImages = limit(catalog.images ?? [], 6).map((img) => ({
    name: img.name ?? undefined,
    family: img.family ?? undefined,
    selfLink: img.selfLink ?? undefined,
    architecture: img.architecture ?? undefined,
    gpuReady: img.gpuReady ?? undefined,
  }));
  const hyperstackRegions = catalog.hyperstack_regions ?? [];
  const hyperstackFlavors = limit(catalog.hyperstack_flavors ?? [], 10).map(
    (f) => ({
      name: f.name,
      region: f.region_name,
      cpu: f.cpu,
      ram: f.ram,
      gpu: f.gpu,
      gpu_count: f.gpu_count,
    }),
  );
  const lambdaRegions = catalog.lambda_regions?.length
    ? catalog.lambda_regions
    : lambdaRegionsFromCatalog.length
      ? lambdaRegionsFromCatalog.map((name) => ({ name }))
      : LAMBDA_REGIONS.map((r) => ({ name: r.value }));
  const lambdaInstanceTypes = limit(
    catalog.lambda_instance_types ?? [],
    25,
  ).map((entry) => ({
    name: entry.name,
    vcpus: entry.vcpus ?? undefined,
    memory_gib: entry.memory_gib ?? undefined,
    gpus: entry.gpus ?? undefined,
    regions: entry.regions ?? undefined,
  }));
  const lambdaImages = limit(catalog.lambda_images ?? [], 10).map((img) => ({
    id: img.id ?? undefined,
    name: img.name ?? undefined,
    family: img.family ?? undefined,
    architecture: img.architecture ?? undefined,
    region: img.region ?? undefined,
  }));
  const nebiusRegions = catalog.nebius_regions ?? [];
  const nebiusInstanceTypes = limit(
    catalog.nebius_instance_types ?? [],
    25,
  ).map((entry) => ({
    name: entry.name,
    platform: entry.platform ?? undefined,
    platform_label: entry.platform_label ?? undefined,
    vcpus: entry.vcpus ?? undefined,
    memory_gib: entry.memory_gib ?? undefined,
    gpus: entry.gpus ?? undefined,
    gpu_label: entry.gpu_label ?? undefined,
  }));
  const nebiusImages = limit(catalog.nebius_images ?? [], 10).map((img) => ({
    id: img.id ?? undefined,
    name: img.name ?? undefined,
    family: img.family ?? undefined,
    version: img.version ?? undefined,
    architecture: img.architecture ?? undefined,
    recommended_platforms: img.recommended_platforms ?? undefined,
  }));
  return {
    gcp: {
      regions: gcpRegions,
      region_groups: regionGroups,
      images: gcpImages,
    },
    hyperstack: {
      regions: hyperstackRegions,
      flavors: hyperstackFlavors,
    },
    ...(lambdaEnabled
      ? {
          lambda: {
            regions: lambdaRegions,
            instance_types: lambdaInstanceTypes,
            images: lambdaImages,
          },
        }
      : {}),
    ...(catalog.nebius_regions?.length || catalog.nebius_instance_types?.length
      ? {
          nebius: {
            regions: nebiusRegions,
            instance_types: nebiusInstanceTypes,
            images: nebiusImages,
          },
        }
      : {}),
  };
};
