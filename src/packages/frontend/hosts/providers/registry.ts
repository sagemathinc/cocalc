import type { HostCatalog } from "@cocalc/conat/hub/api/hosts";
import { getMachineTypeArchitecture } from "@cocalc/util/db-schema/compute-servers";
import {
  formatCpuRamLabel,
  formatGpuLabel,
  formatRegionLabel,
  formatRegionsLabel,
} from "../utils/format";
import { LAMBDA_REGIONS, REGIONS } from "../constants";

export type SelectOption = { value: string; label: string };

type LambdaInstance = NonNullable<HostCatalog["lambda_instance_types"]>[number];
type HyperstackFlavor = NonNullable<HostCatalog["hyperstack_flavors"]>[number];
type NebiusInstance = NonNullable<HostCatalog["nebius_instance_types"]>[number];

export type LambdaInstanceOption = SelectOption & {
  entry: LambdaInstance;
  hasRegions: boolean;
  disabled: boolean;
};

export type HyperstackFlavorOption = SelectOption & {
  flavor: HyperstackFlavor;
};

export type NebiusInstanceOption = SelectOption & {
  entry: NebiusInstance;
};

export const getGcpRegionOptions = (
  catalog?: HostCatalog,
): SelectOption[] => {
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
): SelectOption[] => {
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
): SelectOption[] => {
  if (!catalog?.machine_types_by_zone || !selectedZone) return [];
  return (catalog.machine_types_by_zone[selectedZone] ?? []).map((mt) => ({
    value: mt.name ?? "",
    label: mt.name ?? "unknown",
  }));
};

export const getGcpGpuTypeOptions = (
  catalog: HostCatalog | undefined,
  selectedZone?: string,
): SelectOption[] => {
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
): SelectOption[] => {
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

export const getHyperstackRegionOptions = (
  catalog?: HostCatalog,
): SelectOption[] => {
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
): SelectOption[] => {
  const regionsFromCatalog = getLambdaRegionsFromCatalog(catalog);
  const regions = selectedLambdaInstanceType?.regions?.length
    ? selectedLambdaInstanceType.regions
    : regionsFromCatalog.length
      ? regionsFromCatalog
      : LAMBDA_REGIONS.map((r) => r.value);
  return regions.map((name) => ({ value: name, label: name }));
};

export const getLambdaRegionsFromCatalog = (
  catalog?: HostCatalog,
): string[] => {
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

export const getNebiusRegionOptions = (
  catalog?: HostCatalog,
): SelectOption[] => {
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
