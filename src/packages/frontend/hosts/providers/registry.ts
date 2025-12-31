import type { HostCatalog } from "@cocalc/conat/hub/api/hosts";
import { getMachineTypeArchitecture } from "@cocalc/util/db-schema/compute-servers";
import {
  formatCpuRamLabel,
  formatGpuLabel,
  formatRegionLabel,
  formatRegionsLabel,
} from "../utils/format";
import type { HostProvider } from "../types";
import { GPU_TYPES, LAMBDA_REGIONS, REGIONS, SIZES } from "../constants";

export type HostFieldId =
  | "region"
  | "zone"
  | "machine_type"
  | "gpu_type"
  | "source_image"
  | "size"
  | "gpu";

export const HOST_FIELDS: HostFieldId[] = [
  "region",
  "zone",
  "machine_type",
  "gpu_type",
  "source_image",
  "size",
  "gpu",
];

export type HostFieldOption<T = unknown> = {
  value: string;
  label: string;
  disabled?: boolean;
  meta?: T;
};

export type HostFieldLabels = Record<HostFieldId, string>;
export type HostFieldTooltips = Partial<Record<HostFieldId, string>>;

type LambdaInstance = NonNullable<HostCatalog["lambda_instance_types"]>[number];
type HyperstackFlavor = NonNullable<HostCatalog["hyperstack_flavors"]>[number];
type NebiusInstance = NonNullable<HostCatalog["nebius_instance_types"]>[number];

export type LambdaInstanceOption = HostFieldOption<LambdaInstance> & {
  entry: LambdaInstance;
  hasRegions: boolean;
  disabled: boolean;
};

export type HyperstackFlavorOption = HostFieldOption<HyperstackFlavor> & {
  flavor: HyperstackFlavor;
};

export type NebiusInstanceOption = HostFieldOption<NebiusInstance> & {
  entry: NebiusInstance;
};

export type ProviderSelection = {
  region?: string;
  zone?: string;
  machine_type?: string;
  gpu_type?: string;
  source_image?: string;
  size?: string;
  gpu?: string;
};

export type FieldOptionsMap = Partial<Record<HostFieldId, HostFieldOption[]>>;

export type ProviderFieldSchema = {
  primary: HostFieldId[];
  advanced: HostFieldId[];
  labels?: Partial<Record<HostFieldId, string>>;
  tooltips?: Partial<Record<HostFieldId, string>>;
};

export type ProviderSupports = {
  region: boolean;
  zone: boolean;
  machineType: boolean;
  flavor: boolean;
  instanceType: boolean;
  image: boolean;
  gpuType: boolean;
  size: boolean;
  genericGpu: boolean;
};

export type ProviderStorageSupport = {
  supported: boolean;
  growable?: boolean;
};

export type ProviderCatalogSummary = Record<string, any>;

export type HostProviderFlags = {
  enabled: Record<HostProvider, boolean>;
};

export type HostProviderDescriptor = {
  id: HostProvider;
  label: string;
  featureFlagKey?: string;
  localOnly?: boolean;
  supports: ProviderSupports;
  storage?: ProviderStorageSupport;
  fields: ProviderFieldSchema;
  summarizeCatalog?: (catalog: HostCatalog) => ProviderCatalogSummary | undefined;
  getOptions: (
    catalog: HostCatalog | undefined,
    selection: ProviderSelection,
  ) => FieldOptionsMap;
  buildCreatePayload: (
    vals: Record<string, any>,
    ctx: { fieldOptions: FieldOptionsMap },
  ) => Record<string, any>;
  applyRecommendation?: (rec: {
    provider?: HostProvider;
    region?: string;
    zone?: string;
    machine_type?: string;
    flavor?: string;
    gpu_type?: string;
    gpu_count?: number;
    disk_gb?: number;
    source_image?: string;
  }) => Record<string, any>;
};

const emptyOptions = (): FieldOptionsMap => ({});

const optionsFor = (field: HostFieldId, options: FieldOptionsMap) =>
  options[field] ?? [];

const findOption = <T>(
  field: HostFieldId,
  value: string | undefined,
  options: FieldOptionsMap,
): T | undefined => {
  if (!value) return undefined;
  const match = optionsFor(field, options).find((opt) => opt.value === value);
  return (match?.meta as T) ?? undefined;
};

const getDefaultRegion = (vals: Record<string, any>, options: FieldOptionsMap) =>
  vals.region ?? optionsFor("region", options)[0]?.value;

const buildBasePayload = (
  vals: Record<string, any>,
  options: FieldOptionsMap,
  machine: Record<string, any>,
  wantsGpu: boolean,
) => {
  const machine_type = vals.machine_type || undefined;
  const storage_mode = vals.storage_mode || "persistent";
  return {
    name: vals.name ?? "My Host",
    region: getDefaultRegion(vals, options),
    size: machine_type ?? vals.size ?? SIZES[0].value,
    gpu: wantsGpu,
    machine: {
      cloud: vals.provider !== "none" ? (vals.provider as HostProvider) : undefined,
      storage_mode,
      disk_gb: vals.disk,
      disk_type: vals.disk_type,
      source_image: vals.source_image || undefined,
      metadata: {
        shared: vals.shared,
        bucket: vals.bucket,
        boot_disk_gb: vals.boot_disk_gb,
      },
      ...machine,
    },
  };
};

const applyDiskUpdate = (next: Record<string, any>, disk_gb?: number) => {
  if (typeof disk_gb === "number") next.disk = disk_gb;
};

const limit = <T,>(items: T[], n = 5) => items.slice(0, n);

const shouldIncludeField = (
  field: HostFieldId,
  caps?: NonNullable<HostCatalog["provider_capabilities"]>[string],
) => {
  if (!caps) return true;
  switch (field) {
    case "region":
      return caps.hasRegions !== false;
    case "zone":
      return caps.supportsZones !== false && caps.hasZones !== false;
    case "source_image":
      return caps.supportsCustomImage !== false && caps.hasImages !== false;
    case "gpu_type":
    case "gpu":
      return caps.supportsGpu !== false && caps.hasGpus !== false;
    default:
      return true;
  }
};

export const filterFieldSchemaForCaps = (
  schema: ProviderFieldSchema,
  caps?: NonNullable<HostCatalog["provider_capabilities"]>[string],
): ProviderFieldSchema => {
  if (!caps) return schema;
  const filterFields = (fields: HostFieldId[]) =>
    fields.filter((field) => shouldIncludeField(field, caps));
  return {
    ...schema,
    primary: filterFields(schema.primary),
    advanced: filterFields(schema.advanced),
  };
};
export const getGcpRegionOptions = (
  catalog?: HostCatalog,
): HostFieldOption[] => {
  if (!catalog?.regions?.length) return REGIONS;
  return catalog.regions.map((r) => {
    const zoneWithMeta = catalog.zones?.find(
      (z) => z.region === r.name && (z.location || z.lowC02),
    );
    return {
      value: r.name,
      label: formatRegionLabel(
        r.name,
        zoneWithMeta?.location,
        zoneWithMeta?.lowC02,
      ),
    };
  });
};

export const getGcpZoneOptions = (
  catalog: HostCatalog | undefined,
  selectedRegion?: string,
): HostFieldOption[] => {
  if (!catalog?.regions?.length || !selectedRegion) return [];
  const zones = catalog.regions.find((r) => r.name === selectedRegion)?.zones;
  if (!zones?.length) return [];
  return zones.map((z) => {
    const meta = catalog.zones?.find((zone) => zone.name === z);
    return {
      value: z,
      label: formatRegionLabel(z, meta?.location, meta?.lowC02),
    };
  });
};

export const getGcpMachineTypeOptions = (
  catalog: HostCatalog | undefined,
  selectedZone?: string,
): HostFieldOption[] => {
  if (!catalog?.machine_types_by_zone || !selectedZone) return [];
  return (catalog.machine_types_by_zone[selectedZone] ?? []).map((mt) => ({
    value: mt.name ?? "",
    label: mt.name ?? "unknown",
  }));
};

export const getGcpGpuTypeOptions = (
  catalog: HostCatalog | undefined,
  selectedZone?: string,
): HostFieldOption[] => {
  if (!catalog?.gpu_types_by_zone || !selectedZone) return [];
  return (catalog.gpu_types_by_zone[selectedZone] ?? []).map((gt) => ({
    value: gt.name ?? "",
    label: gt.name ?? "unknown",
  }));
};

export const getGcpImageOptions = (
  catalog: HostCatalog | undefined,
  selectedMachineType?: string,
  selectedGpuType?: string,
): HostFieldOption[] => {
  if (!catalog?.images?.length) return [];
  const wantsGpu = !!selectedGpuType && selectedGpuType !== "none";
  return [...catalog.images]
    .filter((img) => {
      if (!selectedMachineType) {
        const imgArch = (img.architecture ?? "").toUpperCase();
        return imgArch ? imgArch === "X86_64" : true;
      }
      const arch = getMachineTypeArchitecture(selectedMachineType);
      const imgArch = (img.architecture ?? "").toUpperCase();
      if (!imgArch) return true;
      return arch === "arm64" ? imgArch === "ARM64" : imgArch === "X86_64";
    })
    .filter((img) => (wantsGpu ? img.gpuReady === true : img.gpuReady !== true))
    .sort((a, b) => {
      const match = (name: string) => name.match(/ubuntu-.*?(\d{2})(\d{2})/i);
      const versionCode = (name?: string) => {
        const m = name ? match(name) : null;
        return m ? Number(`${m[1]}${m[2]}`) : undefined;
      };
      const va = versionCode(a.family ?? a.name ?? "");
      const vb = versionCode(b.family ?? b.name ?? "");
      if (va != null && vb != null && va !== vb) {
        return vb - va;
      }
      const ta = Date.parse(a.creationTimestamp ?? "");
      const tb = Date.parse(b.creationTimestamp ?? "");
      if (!Number.isFinite(ta) && !Number.isFinite(tb)) return 0;
      if (!Number.isFinite(ta)) return 1;
      if (!Number.isFinite(tb)) return -1;
      return tb - ta;
    })
    .map((img) => {
      const label = img.family
        ? `${img.family}${img.gpuReady ? " (GPU-ready)" : ""}`
        : (img.name ?? "unknown");
      const archSuffix = img.architecture
        ? ` [${img.architecture.toUpperCase()}]`
        : "";
      return {
        value: img.selfLink ?? img.name ?? "",
        label: `${label}${archSuffix}`,
      };
    });
};

const summarizeGcpCatalog = (catalog: HostCatalog) => {
  const zonesByName = new Map(catalog.zones?.map((z) => [z.name, z]) ?? []);
  const regionGroups: Record<string, string[]> = {};
  const regions = (catalog.regions ?? []).map((r) => {
    const zone = r.zones?.[0];
    const zoneDetails = zone ? zonesByName.get(zone) : undefined;
    const machineTypes = limit(
      catalog.machine_types_by_zone?.[zone ?? ""] ?? [],
      5,
    ).map((m) => ({
      name: m.name ?? undefined,
      guestCpus: m.guestCpus ?? undefined,
      memoryMb: m.memoryMb ?? undefined,
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
      sampleMachineTypes: machineTypes,
      sampleGpuTypes: gpuTypes,
    };
  });
  for (const r of regions) {
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
  const images = limit(catalog.images ?? [], 6).map((img) => ({
    name: img.name ?? undefined,
    family: img.family ?? undefined,
    selfLink: img.selfLink ?? undefined,
    architecture: img.architecture ?? undefined,
    gpuReady: img.gpuReady ?? undefined,
  }));
  return { regions, region_groups: regionGroups, images };
};

export const getHyperstackRegionOptions = (
  catalog?: HostCatalog,
): HostFieldOption[] => {
  if (!catalog?.hyperstack_regions?.length) return [];
  return catalog.hyperstack_regions.map((r) => ({
    value: r.name,
    label: r.name,
  }));
};

export const getHyperstackFlavorOptions = (
  catalog: HostCatalog | undefined,
  selectedRegion?: string,
): HyperstackFlavorOption[] => {
  if (!catalog?.hyperstack_flavors?.length || !selectedRegion) return [];
  return catalog.hyperstack_flavors
    .filter((flavor) => flavor.region_name === selectedRegion)
    .map((flavor) => {
      const cpuRamLabel = formatCpuRamLabel(flavor.cpu, flavor.ram);
      const gpuLabel = formatGpuLabel(
        flavor.gpu_count,
        flavor.gpu && flavor.gpu !== "none" ? flavor.gpu : undefined,
      );
      const label = `${flavor.name} (${cpuRamLabel}${gpuLabel})`;
      return { value: flavor.name, label, flavor };
    });
};

const summarizeHyperstackCatalog = (catalog: HostCatalog) => ({
  regions: catalog.hyperstack_regions ?? [],
  flavors: limit(catalog.hyperstack_flavors ?? [], 10).map((f) => ({
    name: f.name,
    region: f.region_name,
    cpu: f.cpu,
    ram: f.ram,
    gpu: f.gpu,
    gpu_count: f.gpu_count,
  })),
});

export const getLambdaInstanceTypeOptions = (
  catalog: HostCatalog | undefined,
): LambdaInstanceOption[] => {
  if (!catalog?.lambda_instance_types?.length) return [];
  return catalog.lambda_instance_types
    .filter((entry) => !!entry?.name)
    .map((entry) => {
      const regionsCount = entry.regions?.length ?? 0;
      const hasRegions = regionsCount > 0;
      const cpuRamLabel = formatCpuRamLabel(entry.vcpus, entry.memory_gib);
      const gpuLabel = formatGpuLabel(entry.gpus);
      const regionsLabel = formatRegionsLabel(regionsCount);
      return {
        value: entry.name,
        label: `${entry.name} (${cpuRamLabel}${gpuLabel}${regionsLabel})`,
        entry,
        hasRegions,
        disabled: !hasRegions,
      };
    })
    .sort((a, b) => {
      if (a.hasRegions !== b.hasRegions) {
        return a.hasRegions ? -1 : 1;
      }
      return a.value.localeCompare(b.value);
    });
};

export const getLambdaRegionOptions = (
  catalog: HostCatalog | undefined,
  selectedLambdaInstanceType?: LambdaInstance,
): HostFieldOption[] => {
  const regionsFromCatalog = getLambdaRegionsFromCatalog(catalog);
  const regions = selectedLambdaInstanceType?.regions?.length
    ? selectedLambdaInstanceType.regions
    : regionsFromCatalog.length
      ? regionsFromCatalog
      : LAMBDA_REGIONS.map((r) => r.value);
  return regions.map((name) => ({ value: name, label: name }));
};

export const getLambdaRegionsFromCatalog = (catalog?: HostCatalog): string[] => {
  if (!catalog) return [];
  if (catalog.lambda_regions?.length) {
    return catalog.lambda_regions.map((r) => r.name).filter(Boolean);
  }
  if (catalog.lambda_instance_types?.length) {
    return Array.from(
      new Set(
        catalog.lambda_instance_types.flatMap((entry) => entry.regions ?? []),
      ),
    );
  }
  return [];
};

const summarizeLambdaCatalog = (catalog: HostCatalog) => {
  const lambdaRegions = catalog.lambda_regions?.length
    ? catalog.lambda_regions
    : getLambdaRegionsFromCatalog(catalog).map((name) => ({ name }));
  return {
    regions: lambdaRegions,
    instance_types: limit(catalog.lambda_instance_types ?? [], 25).map(
      (entry) => ({
        name: entry.name,
        vcpus: entry.vcpus ?? undefined,
        memory_gib: entry.memory_gib ?? undefined,
        gpus: entry.gpus ?? undefined,
        regions: entry.regions ?? undefined,
      }),
    ),
    images: limit(catalog.lambda_images ?? [], 10).map((img) => ({
      id: img.id ?? undefined,
      name: img.name ?? undefined,
      family: img.family ?? undefined,
      architecture: img.architecture ?? undefined,
      region: img.region ?? undefined,
    })),
  };
};

export const getNebiusRegionOptions = (
  catalog?: HostCatalog,
): HostFieldOption[] => {
  if (!catalog?.nebius_regions?.length) return [];
  return catalog.nebius_regions.map((r) => ({ value: r.name, label: r.name }));
};

export const getNebiusInstanceTypeOptions = (
  catalog?: HostCatalog,
): NebiusInstanceOption[] => {
  if (!catalog?.nebius_instance_types?.length) return [];
  return catalog.nebius_instance_types
    .filter((entry) => !!entry?.name)
    .map((entry) => {
      const platformLabel = entry.platform_label
        ? ` · ${entry.platform_label}`
        : "";
      const cpuRamLabel = formatCpuRamLabel(entry.vcpus, entry.memory_gib);
      const gpuLabel = formatGpuLabel(entry.gpus, entry.gpu_label);
      return {
        value: entry.name,
        label: `${entry.name} (${cpuRamLabel}${gpuLabel}${platformLabel})`,
        entry,
      };
    })
    .sort((a, b) => a.value.localeCompare(b.value));
};

const summarizeNebiusCatalog = (catalog: HostCatalog) => ({
  regions: catalog.nebius_regions ?? [],
  instance_types: limit(catalog.nebius_instance_types ?? [], 25).map(
    (entry) => ({
      name: entry.name,
      platform: entry.platform ?? undefined,
      platform_label: entry.platform_label ?? undefined,
      vcpus: entry.vcpus ?? undefined,
      memory_gib: entry.memory_gib ?? undefined,
      gpus: entry.gpus ?? undefined,
      gpu_label: entry.gpu_label ?? undefined,
    }),
  ),
  images: limit(catalog.nebius_images ?? [], 10).map((img) => ({
    id: img.id ?? undefined,
    name: img.name ?? undefined,
    family: img.family ?? undefined,
    version: img.version ?? undefined,
    architecture: img.architecture ?? undefined,
    recommended_platforms: img.recommended_platforms ?? undefined,
  })),
});

export const PROVIDER_REGISTRY: Record<HostProvider, HostProviderDescriptor> = {
  gcp: {
    id: "gcp",
    label: "Google Cloud",
    featureFlagKey: "compute_servers_google-cloud_enabled",
    summarizeCatalog: summarizeGcpCatalog,
    supports: {
      region: true,
      zone: true,
      machineType: true,
      flavor: false,
      instanceType: false,
      image: true,
      gpuType: true,
      size: false,
      genericGpu: false,
    },
    fields: {
      primary: ["region", "zone", "machine_type", "gpu_type"],
      advanced: ["source_image"],
      labels: {
        machine_type: "Machine type",
        gpu_type: "GPU",
        source_image: "Base image",
      },
      tooltips: {
        zone: "Zones are derived from the selected region.",
        source_image: "Optional override; leave blank for the default Ubuntu image.",
      },
    },
    storage: { supported: true, growable: true },
    getOptions: (catalog, selection) => ({
      ...emptyOptions(),
      region: getGcpRegionOptions(catalog),
      zone: getGcpZoneOptions(catalog, selection.region),
      machine_type: getGcpMachineTypeOptions(catalog, selection.zone),
      gpu_type: [
        { value: "none", label: "No GPU" },
        ...getGcpGpuTypeOptions(catalog, selection.zone),
      ],
      source_image: [
        { value: "", label: "Default (Ubuntu LTS)" },
        ...getGcpImageOptions(
          catalog,
          selection.machine_type,
          selection.gpu_type,
        ),
      ],
    }),
    buildCreatePayload: (vals, ctx) => {
      const gpu_type =
        vals.gpu_type && vals.gpu_type !== "none" ? vals.gpu_type : undefined;
      const wantsGpu = !!gpu_type;
      return buildBasePayload(
        vals,
        ctx.fieldOptions,
        {
          machine_type: vals.machine_type || undefined,
          gpu_type,
          gpu_count: gpu_type ? 1 : undefined,
          zone: vals.zone ?? undefined,
        },
        wantsGpu,
      );
    },
    applyRecommendation: (rec) => {
      const next: Record<string, any> = { provider: "gcp" };
      if (rec.region) next.region = rec.region;
      if (rec.zone) next.zone = rec.zone;
      if (rec.machine_type) next.machine_type = rec.machine_type;
      if (rec.gpu_type) next.gpu_type = rec.gpu_type;
      if (rec.source_image) next.source_image = rec.source_image;
      applyDiskUpdate(next, rec.disk_gb);
      return next;
    },
  },
  hyperstack: {
    id: "hyperstack",
    label: "Hyperstack Cloud",
    featureFlagKey: "compute_servers_hyperstack_enabled",
    summarizeCatalog: summarizeHyperstackCatalog,
    supports: {
      region: true,
      zone: false,
      machineType: false,
      flavor: true,
      instanceType: false,
      image: false,
      gpuType: false,
      size: false,
      genericGpu: false,
    },
    fields: {
      primary: ["region", "size"],
      advanced: [],
      labels: {
        size: "Size",
      },
    },
    storage: { supported: true, growable: false },
    getOptions: (catalog, selection) => ({
      ...emptyOptions(),
      region: getHyperstackRegionOptions(catalog),
      size: getHyperstackFlavorOptions(catalog, selection.region).map((opt) => ({
        value: opt.value,
        label: opt.label,
        meta: opt.flavor,
      })),
    }),
    buildCreatePayload: (vals, ctx) => {
      const flavor = findOption<HyperstackFlavor>("size", vals.size, ctx.fieldOptions);
      const hyperGpuType = flavor && flavor.gpu !== "none" ? flavor.gpu : undefined;
      const hyperGpuCount = flavor?.gpu_count || 0;
      const wantsGpu = hyperGpuCount > 0;
      return buildBasePayload(
        vals,
        ctx.fieldOptions,
        {
          machine_type: flavor?.name,
          gpu_type: hyperGpuType,
          gpu_count: hyperGpuCount || undefined,
        },
        wantsGpu,
      );
    },
    applyRecommendation: (rec) => {
      const next: Record<string, any> = { provider: "hyperstack" };
      if (rec.region) next.region = rec.region;
      if (rec.flavor) next.size = rec.flavor;
      applyDiskUpdate(next, rec.disk_gb);
      return next;
    },
  },
  lambda: {
    id: "lambda",
    label: "Lambda Cloud",
    featureFlagKey: "compute_servers_lambda_enabled",
    summarizeCatalog: summarizeLambdaCatalog,
    supports: {
      region: true,
      zone: false,
      machineType: false,
      flavor: false,
      instanceType: true,
      image: false,
      gpuType: false,
      size: false,
      genericGpu: false,
    },
    fields: {
      primary: ["machine_type", "region"],
      advanced: [],
      labels: {
        machine_type: "Instance type",
      },
    },
    storage: { supported: false },
    getOptions: (catalog, selection) => {
      const instanceTypes = getLambdaInstanceTypeOptions(catalog);
      const instanceEntry = instanceTypes.find(
        (opt) => opt.value === selection.machine_type,
      )?.entry;
      return {
        ...emptyOptions(),
        machine_type: instanceTypes.map((opt) => ({
          value: opt.value,
          label: opt.label,
          meta: opt.entry,
          disabled: opt.disabled,
        })),
        region: getLambdaRegionOptions(catalog, instanceEntry),
      };
    },
    buildCreatePayload: (vals, ctx) => {
      const instance = findOption<LambdaInstance>(
        "machine_type",
        vals.machine_type,
        ctx.fieldOptions,
      );
      const gpuCount = instance?.gpus ?? 0;
      const wantsGpu = gpuCount > 0;
      return buildBasePayload(
        vals,
        ctx.fieldOptions,
        {
          machine_type: vals.machine_type || undefined,
          gpu_count: gpuCount || undefined,
        },
        wantsGpu,
      );
    },
    applyRecommendation: (rec) => {
      const next: Record<string, any> = { provider: "lambda" };
      if (rec.region) next.region = rec.region;
      if (rec.machine_type) next.machine_type = rec.machine_type;
      applyDiskUpdate(next, rec.disk_gb);
      return next;
    },
  },
  nebius: {
    id: "nebius",
    label: "Nebius AI Cloud",
    featureFlagKey: "project_hosts_nebius_enabled",
    summarizeCatalog: summarizeNebiusCatalog,
    supports: {
      region: true,
      zone: false,
      machineType: false,
      flavor: false,
      instanceType: true,
      image: false,
      gpuType: false,
      size: false,
      genericGpu: false,
    },
    fields: {
      primary: ["machine_type", "region"],
      advanced: [],
      labels: {
        machine_type: "Instance type",
      },
    },
    storage: { supported: true, growable: true },
    getOptions: (catalog) => ({
      ...emptyOptions(),
      machine_type: getNebiusInstanceTypeOptions(catalog).map((opt) => ({
        value: opt.value,
        label: opt.label,
        meta: opt.entry,
      })),
      region: getNebiusRegionOptions(catalog),
    }),
    buildCreatePayload: (vals, ctx) => {
      const instance = findOption<NebiusInstance>(
        "machine_type",
        vals.machine_type,
        ctx.fieldOptions,
      );
      const gpuCount = instance?.gpus ?? 0;
      const wantsGpu = gpuCount > 0;
      return buildBasePayload(
        vals,
        ctx.fieldOptions,
        {
          machine_type: vals.machine_type || undefined,
          gpu_type: instance?.gpu_label,
          gpu_count: gpuCount || undefined,
        },
        wantsGpu,
      );
    },
    applyRecommendation: (rec) => {
      const next: Record<string, any> = { provider: "nebius" };
      if (rec.region) next.region = rec.region;
      if (rec.machine_type) next.machine_type = rec.machine_type;
      applyDiskUpdate(next, rec.disk_gb);
      return next;
    },
  },
  none: {
    id: "none",
    label: "Local (manual setup)",
    localOnly: true,
    supports: {
      region: false,
      zone: false,
      machineType: false,
      flavor: false,
      instanceType: false,
      image: false,
      gpuType: false,
      size: true,
      genericGpu: true,
    },
    fields: {
      primary: ["size"],
      advanced: ["gpu"],
      labels: {
        size: "Size",
        gpu: "GPU",
      },
      tooltips: {
        gpu: "Only needed for GPU workloads.",
      },
    },
    storage: { supported: true, growable: true },
    getOptions: () => ({
      ...emptyOptions(),
      size: SIZES,
      gpu: GPU_TYPES,
    }),
    buildCreatePayload: (vals, ctx) => {
      const genericGpuType =
        vals.gpu && vals.gpu !== "none" ? vals.gpu : undefined;
      const wantsGpu = !!genericGpuType;
      return buildBasePayload(
        vals,
        ctx.fieldOptions,
        {
          machine_type: vals.machine_type || undefined,
          gpu_type: genericGpuType,
          gpu_count: genericGpuType ? 1 : undefined,
        },
        wantsGpu,
      );
    },
    applyRecommendation: (rec) => {
      const next: Record<string, any> = { provider: "none" };
      applyDiskUpdate(next, rec.disk_gb);
      return next;
    },
  },
};

export const getProviderEnablement = (opts: {
  customize?: { get?: (key: string) => unknown };
  showLocal: boolean;
}): HostProviderFlags => {
  const enabled = {} as Record<HostProvider, boolean>;
  for (const entry of Object.values(PROVIDER_REGISTRY)) {
    if (entry.localOnly) {
      enabled[entry.id] = opts.showLocal;
    } else if (entry.featureFlagKey) {
      const flag = opts.customize?.get?.(entry.featureFlagKey);
      // Default to enabled when the customize store isn't ready or key is unset,
      // so the UI doesn't end up with an empty provider list during load/dev.
      enabled[entry.id] = flag === undefined ? true : !!flag;
    } else {
      enabled[entry.id] = true;
    }
  }
  return { enabled };
};

export const isProviderEnabled = (
  provider: HostProvider,
  flags: HostProviderFlags,
) => !!flags.enabled[provider];

export const getProviderDescriptor = (provider: HostProvider) =>
  PROVIDER_REGISTRY[provider];

export const isKnownProvider = (value: string): value is HostProvider =>
  Object.prototype.hasOwnProperty.call(PROVIDER_REGISTRY, value);

export const getProviderStorageSupport = (
  provider: HostProvider,
  caps?: HostCatalog["provider_capabilities"],
): ProviderStorageSupport => {
  const cap = caps?.[provider]?.persistentStorage;
  if (cap) return cap;
  return PROVIDER_REGISTRY[provider].storage ?? { supported: true, growable: true };
};

export const getProviderOptions = (
  provider: HostProvider,
  catalog: HostCatalog | undefined,
  selection: ProviderSelection,
): FieldOptionsMap => PROVIDER_REGISTRY[provider].getOptions(catalog, selection);

export const buildCreateHostPayload = (
  vals: Record<string, any>,
  ctx: { fieldOptions: FieldOptionsMap },
) => {
  const provider = (vals.provider ?? "none") as HostProvider;
  return getProviderDescriptor(provider).buildCreatePayload(vals, ctx);
};

export const buildRecommendationUpdate = (rec: {
  provider?: HostProvider;
  region?: string;
  zone?: string;
  machine_type?: string;
  flavor?: string;
  gpu_type?: string;
  gpu_count?: number;
  disk_gb?: number;
  source_image?: string;
}) => {
  if (!rec.provider) return {};
  const descriptor = getProviderDescriptor(rec.provider);
  if (descriptor.applyRecommendation) {
    return descriptor.applyRecommendation(rec);
  }
  const next: Record<string, any> = { provider: rec.provider };
  applyDiskUpdate(next, rec.disk_gb);
  return next;
};

export const getProviderOptionsList = (
  flags: HostProviderFlags,
): Array<{ value: HostProvider; label: string }> =>
  (Object.values(PROVIDER_REGISTRY) as HostProviderDescriptor[])
    .filter((entry) => isProviderEnabled(entry.id, flags))
    .map((entry) => ({ value: entry.id, label: entry.label }));

export const getRefreshProviders = (
  flags: HostProviderFlags,
): Array<{ value: HostProvider; label: string }> =>
  (Object.values(PROVIDER_REGISTRY) as HostProviderDescriptor[])
    .filter(
      (entry) => entry.id !== "none" && isProviderEnabled(entry.id, flags),
    )
    .map((entry) => ({ value: entry.id, label: entry.label }));
