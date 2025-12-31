import { useEffect, useMemo } from "@cocalc/frontend/app-framework";
import type { FormInstance } from "antd";
import type { HostCatalog } from "@cocalc/conat/hub/api/hosts";
import { getMachineTypeArchitecture } from "@cocalc/util/db-schema/compute-servers";
import type { HostProvider } from "../types";
import {
  formatCpuRamLabel,
  formatGpuLabel,
  formatRegionLabel,
  formatRegionsLabel,
} from "../utils/format";
import { buildCatalogSummary } from "../utils/normalize-catalog";
import { LAMBDA_REGIONS, REGIONS } from "../constants";

type UseHostFormArgs = {
  form: FormInstance;
  catalog?: HostCatalog;
  selectedProvider?: HostProvider;
  selectedRegion?: string;
  selectedZone?: string;
  selectedMachineType?: string;
  selectedGpuType?: string;
  selectedSourceImage?: string;
  selectedSize?: string;
  selectedStorageMode?: string;
  lambdaEnabled: boolean;
};

export const useHostForm = ({
  form,
  catalog,
  selectedProvider,
  selectedRegion,
  selectedZone,
  selectedMachineType,
  selectedGpuType,
  selectedSourceImage,
  selectedSize,
  selectedStorageMode,
  lambdaEnabled,
}: UseHostFormArgs) => {
  const providerCaps = useMemo(() => {
    if (!selectedProvider || !catalog?.provider_capabilities) return undefined;
    return catalog.provider_capabilities[selectedProvider];
  }, [catalog, selectedProvider]);

  const supportsPersistentStorage =
    providerCaps?.persistentStorage?.supported ?? selectedProvider !== "lambda";
  const persistentGrowable = providerCaps?.persistentStorage?.growable ?? true;
  const storageModeOptions = supportsPersistentStorage
    ? [
        { value: "ephemeral", label: "Ephemeral (local)" },
        {
          value: "persistent",
          label: persistentGrowable
            ? "Persistent (growable disk)"
            : "Persistent (fixed size)",
        },
      ]
    : [{ value: "ephemeral", label: "Ephemeral (local)" }];
  const showDiskFields =
    supportsPersistentStorage && selectedStorageMode !== "ephemeral";

  const hyperstackRegionOptions = catalog?.hyperstack_regions?.length
    ? catalog.hyperstack_regions.map((r) => ({
        value: r.name,
        label: r.name,
      }))
    : [];

  const lambdaInstanceTypeOptions =
    selectedProvider === "lambda" && catalog?.lambda_instance_types?.length
      ? catalog.lambda_instance_types
          .filter((entry) => !!entry?.name)
          .map((entry) => {
            const regionsCount = entry.regions?.length ?? 0;
            const hasRegions = regionsCount > 0;
            const cpuRamLabel = formatCpuRamLabel(
              entry.vcpus,
              entry.memory_gib,
            );
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
          })
      : [];

  const nebiusInstanceTypeOptions =
    selectedProvider === "nebius" && catalog?.nebius_instance_types?.length
      ? catalog.nebius_instance_types
          .filter((entry) => !!entry?.name)
          .map((entry) => {
            const platformLabel = entry.platform_label
              ? ` · ${entry.platform_label}`
              : "";
            const cpuRamLabel = formatCpuRamLabel(
              entry.vcpus,
              entry.memory_gib,
            );
            const gpuLabel = formatGpuLabel(entry.gpus, entry.gpu_label);
            return {
              value: entry.name,
              label: `${entry.name} (${cpuRamLabel}${gpuLabel}${platformLabel})`,
              entry,
            };
          })
          .sort((a, b) => a.value.localeCompare(b.value))
      : [];

  const selectedLambdaInstanceType =
    selectedProvider === "lambda"
      ? lambdaInstanceTypeOptions.find(
          (opt) => opt.value === selectedMachineType,
        )?.entry
      : undefined;

  const lambdaRegionsFromCatalog = catalog?.lambda_regions?.length
    ? catalog.lambda_regions.map((r) => r.name).filter(Boolean)
    : catalog?.lambda_instance_types?.length
      ? Array.from(
          new Set(
            catalog.lambda_instance_types.flatMap(
              (entry) => entry.regions ?? [],
            ),
          ),
        )
      : [];

  const lambdaRegionOptions =
    selectedProvider === "lambda"
      ? (selectedLambdaInstanceType?.regions?.length
          ? selectedLambdaInstanceType.regions
          : lambdaRegionsFromCatalog.length
            ? lambdaRegionsFromCatalog
            : LAMBDA_REGIONS.map((r) => r.value)
        ).map((name) => ({ value: name, label: name }))
      : [];

  const nebiusRegionOptions = catalog?.nebius_regions?.length
    ? catalog.nebius_regions.map((r) => ({ value: r.name, label: r.name }))
    : [];

  const regionOptions =
    selectedProvider === "hyperstack" && hyperstackRegionOptions.length
      ? hyperstackRegionOptions
      : selectedProvider === "lambda"
        ? lambdaRegionOptions
        : selectedProvider === "nebius" && nebiusRegionOptions.length
          ? nebiusRegionOptions
          : selectedProvider === "gcp" && catalog?.regions?.length
            ? catalog.regions.map((r) => {
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
              })
            : REGIONS;

  const zoneOptions =
    selectedProvider === "gcp" && catalog?.regions?.length
      ? (
          catalog.regions.find((r) => r.name === selectedRegion)?.zones ?? []
        ).map((z) => {
          const meta = catalog.zones?.find((zone) => zone.name === z);
          return {
            value: z,
            label: formatRegionLabel(z, meta?.location, meta?.lowC02),
          };
        })
      : [];

  const machineTypeOptions =
    selectedProvider === "gcp" && selectedZone && catalog?.machine_types_by_zone
      ? (catalog.machine_types_by_zone[selectedZone] ?? []).map((mt) => ({
          value: mt.name ?? "",
          label: mt.name ?? "unknown",
        }))
      : [];

  const hyperstackFlavorOptions =
    selectedProvider === "hyperstack" && catalog?.hyperstack_flavors?.length
      ? catalog.hyperstack_flavors
          .filter((flavor) => flavor.region_name === selectedRegion)
          .map((flavor) => {
            const cpuRamLabel = formatCpuRamLabel(flavor.cpu, flavor.ram);
            const gpuLabel = formatGpuLabel(
              flavor.gpu_count,
              flavor.gpu && flavor.gpu !== "none" ? flavor.gpu : undefined,
            );
            const label = `${flavor.name} (${cpuRamLabel}${gpuLabel})`;
            return { value: flavor.name, label, flavor };
          })
      : [];

  const gpuTypeOptions =
    selectedProvider === "gcp" && selectedZone && catalog?.gpu_types_by_zone
      ? (catalog.gpu_types_by_zone[selectedZone] ?? []).map((gt) => ({
          value: gt.name ?? "",
          label: gt.name ?? "unknown",
        }))
      : [];

  const wantsGpu =
    selectedProvider === "gcp" &&
    !!selectedGpuType &&
    selectedGpuType !== "none";

  const imageOptions =
    selectedProvider === "gcp" && catalog?.images?.length
      ? [...catalog.images]
          .filter((img) => {
            if (!selectedMachineType) {
              const imgArch = (img.architecture ?? "").toUpperCase();
              return imgArch ? imgArch === "X86_64" : true;
            }
            const arch = getMachineTypeArchitecture(selectedMachineType);
            const imgArch = (img.architecture ?? "").toUpperCase();
            if (!imgArch) return true;
            return arch === "arm64"
              ? imgArch === "ARM64"
              : imgArch === "X86_64";
          })
          .filter((img) =>
            wantsGpu ? img.gpuReady === true : img.gpuReady !== true,
          )
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
          })
      : [];

  const catalogSummary = useMemo(
    () =>
      buildCatalogSummary({
        catalog,
        lambdaRegionsFromCatalog,
        lambdaEnabled: !!lambdaEnabled,
      }),
    [catalog, lambdaRegionsFromCatalog, lambdaEnabled],
  );

  useEffect(() => {
    if (!supportsPersistentStorage) {
      form.setFieldsValue({ storage_mode: "ephemeral" });
    } else if (!form.getFieldValue("storage_mode")) {
      form.setFieldsValue({ storage_mode: "persistent" });
    }
  }, [supportsPersistentStorage, form]);

  useEffect(() => {
    if (!selectedProvider || selectedProvider === "none") return;
    if (!regionOptions.length) return;
    const values = new Set(regionOptions.map((r) => r.value));
    if (selectedRegion && values.has(selectedRegion)) return;
    form.setFieldsValue({ region: regionOptions[0].value });
  }, [selectedProvider, regionOptions, selectedRegion, form]);

  useEffect(() => {
    if (selectedProvider !== "gcp") return;
    if (!imageOptions.length) return;
    const values = new Set(imageOptions.map((img) => img.value));
    if (selectedSourceImage && values.has(selectedSourceImage)) return;
    form.setFieldsValue({ source_image: imageOptions[0].value });
  }, [selectedProvider, selectedSourceImage, imageOptions, form]);

  useEffect(() => {
    if (selectedProvider !== "gcp") return;
    if (!zoneOptions.length) return;
    if (selectedZone && zoneOptions.some((z) => z.value === selectedZone)) {
      return;
    }
    form.setFieldsValue({ zone: zoneOptions[0].value });
  }, [selectedProvider, selectedRegion, zoneOptions, selectedZone, form]);

  useEffect(() => {
    if (selectedProvider !== "lambda") return;
    if (!lambdaInstanceTypeOptions.length) return;
    const values = new Set(lambdaInstanceTypeOptions.map((opt) => opt.value));
    if (selectedMachineType && values.has(selectedMachineType)) {
      const selectedOption = lambdaInstanceTypeOptions.find(
        (opt) => opt.value === selectedMachineType,
      );
      if (!selectedOption?.disabled) return;
    }
    const preferred =
      lambdaInstanceTypeOptions.find((opt) => !opt.disabled) ??
      lambdaInstanceTypeOptions[0];
    if (preferred) {
      form.setFieldsValue({ machine_type: preferred.value });
    }
  }, [selectedProvider, lambdaInstanceTypeOptions, selectedMachineType, form]);

  useEffect(() => {
    if (selectedProvider !== "nebius") return;
    if (!nebiusInstanceTypeOptions.length) return;
    const values = new Set(nebiusInstanceTypeOptions.map((opt) => opt.value));
    if (selectedMachineType && values.has(selectedMachineType)) return;
    form.setFieldsValue({ machine_type: nebiusInstanceTypeOptions[0].value });
  }, [selectedProvider, nebiusInstanceTypeOptions, selectedMachineType, form]);

  useEffect(() => {
    if (selectedProvider !== "gcp") return;
    if (!machineTypeOptions.length) return;
    if (
      selectedMachineType &&
      machineTypeOptions.some((mt) => mt.value === selectedMachineType)
    ) {
      return;
    }
    form.setFieldsValue({ machine_type: machineTypeOptions[0].value });
  }, [
    selectedProvider,
    selectedZone,
    machineTypeOptions,
    selectedMachineType,
    form,
  ]);

  useEffect(() => {
    if (selectedProvider !== "hyperstack") return;
    if (!hyperstackFlavorOptions.length) return;
    const values = new Set(hyperstackFlavorOptions.map((opt) => opt.value));
    if (selectedSize && values.has(selectedSize)) return;
    form.setFieldsValue({ size: hyperstackFlavorOptions[0].value });
  }, [selectedProvider, hyperstackFlavorOptions, selectedSize, form]);

  return {
    providerCaps,
    supportsPersistentStorage,
    persistentGrowable,
    storageModeOptions,
    showDiskFields,
    hyperstackRegionOptions,
    lambdaInstanceTypeOptions,
    nebiusInstanceTypeOptions,
    lambdaRegionOptions,
    nebiusRegionOptions,
    regionOptions,
    zoneOptions,
    machineTypeOptions,
    hyperstackFlavorOptions,
    gpuTypeOptions,
    imageOptions,
    selectedLambdaInstanceType,
    catalogSummary,
  };
};
