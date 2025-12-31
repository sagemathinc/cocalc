import { useEffect, useMemo, useRef } from "@cocalc/frontend/app-framework";
import type { FormInstance } from "antd";
import type { HostCatalog } from "@cocalc/conat/hub/api/hosts";
import type { HostProvider, HostRecommendation } from "../types";
import { buildCatalogSummary } from "../utils/normalize-catalog";
import {
  getGcpGpuTypeOptions,
  getGcpImageOptions,
  getGcpMachineTypeOptions,
  getGcpRegionOptions,
  getGcpZoneOptions,
  getHyperstackFlavorOptions,
  getHyperstackRegionOptions,
  getLambdaInstanceTypeOptions,
  getLambdaRegionOptions,
  getLambdaRegionsFromCatalog,
  getNebiusInstanceTypeOptions,
  getNebiusRegionOptions,
} from "../providers/registry";

type SelectOption = { value: string };

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

const inOptions = (value: string | undefined, options?: SelectOption[]) =>
  !!value && !!options?.some((opt) => opt.value === value);

const firstValue = (options?: SelectOption[]) => options?.[0]?.value;

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
  const prevProviderRef = useRef<HostProvider | undefined>(undefined);
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

  const hyperstackRegionOptions = useMemo(
    () => getHyperstackRegionOptions(catalog),
    [catalog],
  );

  const lambdaInstanceTypeOptions = useMemo(
    () => (selectedProvider === "lambda" ? getLambdaInstanceTypeOptions(catalog) : []),
    [catalog, selectedProvider],
  );

  const nebiusInstanceTypeOptions = useMemo(
    () => (selectedProvider === "nebius" ? getNebiusInstanceTypeOptions(catalog) : []),
    [catalog, selectedProvider],
  );

  const selectedLambdaInstanceType = useMemo(() => {
    if (selectedProvider !== "lambda") return undefined;
    return lambdaInstanceTypeOptions.find(
      (opt) => opt.value === selectedMachineType,
    )?.entry;
  }, [lambdaInstanceTypeOptions, selectedMachineType, selectedProvider]);

  const lambdaRegionsFromCatalog = useMemo(
    () => getLambdaRegionsFromCatalog(catalog),
    [catalog],
  );

  const lambdaRegionOptions = useMemo(
    () =>
      selectedProvider === "lambda"
        ? getLambdaRegionOptions(catalog, selectedLambdaInstanceType)
        : [],
    [catalog, selectedLambdaInstanceType, selectedProvider],
  );

  const nebiusRegionOptions = useMemo(
    () => getNebiusRegionOptions(catalog),
    [catalog],
  );

  const regionOptions = useMemo(() => {
    if (selectedProvider === "hyperstack") return hyperstackRegionOptions;
    if (selectedProvider === "lambda") return lambdaRegionOptions;
    if (selectedProvider === "nebius") return nebiusRegionOptions;
    return getGcpRegionOptions(catalog);
  }, [
    catalog,
    hyperstackRegionOptions,
    lambdaRegionOptions,
    nebiusRegionOptions,
    selectedProvider,
  ]);

  const zoneOptions = useMemo(
    () =>
      selectedProvider === "gcp"
        ? getGcpZoneOptions(catalog, selectedRegion)
        : [],
    [catalog, selectedProvider, selectedRegion],
  );

  const machineTypeOptions = useMemo(
    () =>
      selectedProvider === "gcp"
        ? getGcpMachineTypeOptions(catalog, selectedZone)
        : [],
    [catalog, selectedProvider, selectedZone],
  );

  const hyperstackFlavorOptions = useMemo(
    () =>
      selectedProvider === "hyperstack"
        ? getHyperstackFlavorOptions(catalog, selectedRegion)
        : [],
    [catalog, selectedProvider, selectedRegion],
  );

  const gpuTypeOptions = useMemo(
    () =>
      selectedProvider === "gcp"
        ? getGcpGpuTypeOptions(catalog, selectedZone)
        : [],
    [catalog, selectedProvider, selectedZone],
  );

  const imageOptions = useMemo(
    () =>
      selectedProvider === "gcp"
        ? getGcpImageOptions(catalog, selectedMachineType, selectedGpuType)
        : [],
    [catalog, selectedProvider, selectedMachineType, selectedGpuType],
  );

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
    const updates: Record<string, any> = {};
    const providerChanged = selectedProvider !== prevProviderRef.current;
    if (providerChanged) {
      prevProviderRef.current = selectedProvider;
    }

    if (providerChanged) {
      if (selectedProvider !== "gcp") {
        updates.zone = undefined;
        updates.gpu_type = undefined;
        updates.source_image = undefined;
      }
      if (selectedProvider !== "hyperstack") {
        updates.size = undefined;
      }
      if (selectedProvider !== "lambda" && selectedProvider !== "nebius") {
        updates.machine_type = updates.machine_type ?? undefined;
      }
    }

    const ensureValue = (
      field: string,
      value: string | undefined,
      options?: SelectOption[],
      fallback?: string,
    ) => {
      if (!options?.length) return;
      if (inOptions(value, options)) return;
      updates[field] = fallback ?? firstValue(options);
    };

    if (selectedProvider === "gcp") {
      ensureValue("region", selectedRegion, regionOptions);
      ensureValue("zone", selectedZone, zoneOptions);
      ensureValue("machine_type", selectedMachineType, machineTypeOptions);
      ensureValue("source_image", selectedSourceImage, imageOptions);
      if (gpuTypeOptions.length) {
        if (!inOptions(selectedGpuType, gpuTypeOptions)) {
          updates.gpu_type = "none";
        }
      }
    } else if (selectedProvider === "hyperstack") {
      ensureValue("region", selectedRegion, hyperstackRegionOptions);
      ensureValue("size", selectedSize, hyperstackFlavorOptions);
    } else if (selectedProvider === "lambda") {
      const preferredLambda =
        lambdaInstanceTypeOptions.find((opt) => !opt.disabled)?.value ??
        firstValue(lambdaInstanceTypeOptions);
      ensureValue(
        "machine_type",
        selectedMachineType,
        lambdaInstanceTypeOptions,
        preferredLambda,
      );
      ensureValue("region", selectedRegion, lambdaRegionOptions);
    } else if (selectedProvider === "nebius") {
      ensureValue("machine_type", selectedMachineType, nebiusInstanceTypeOptions);
      ensureValue("region", selectedRegion, nebiusRegionOptions);
    }

    if (Object.keys(updates).length > 0) {
      form.setFieldsValue(updates);
    }
  }, [
    form,
    selectedProvider,
    selectedRegion,
    selectedZone,
    selectedMachineType,
    selectedGpuType,
    selectedSourceImage,
    selectedSize,
    regionOptions,
    zoneOptions,
    machineTypeOptions,
    gpuTypeOptions,
    imageOptions,
    hyperstackRegionOptions,
    hyperstackFlavorOptions,
    lambdaInstanceTypeOptions,
    lambdaRegionOptions,
    nebiusInstanceTypeOptions,
    nebiusRegionOptions,
  ]);

  const applyRecommendation = (rec: HostRecommendation) => {
    if (!rec.provider) return;
    const next: Record<string, any> = { provider: rec.provider };
    if (rec.provider === "gcp") {
      if (rec.region) next.region = rec.region;
      if (rec.zone) next.zone = rec.zone;
      if (rec.machine_type) next.machine_type = rec.machine_type;
      if (rec.gpu_type) next.gpu_type = rec.gpu_type;
      if (rec.source_image) next.source_image = rec.source_image;
    } else if (rec.provider === "hyperstack") {
      if (rec.region) next.region = rec.region;
      if (rec.flavor) next.size = rec.flavor;
    } else if (rec.provider === "lambda") {
      if (rec.region) next.region = rec.region;
      if (rec.machine_type) next.machine_type = rec.machine_type;
    } else if (rec.provider === "nebius") {
      if (rec.region) next.region = rec.region;
      if (rec.machine_type) next.machine_type = rec.machine_type;
    }
    if (rec.disk_gb) next.disk = rec.disk_gb;
    form.setFieldsValue(next);
  };

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
    applyRecommendation,
  };
};
