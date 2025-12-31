import { useEffect, useMemo } from "@cocalc/frontend/app-framework";
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

  const hyperstackRegionOptions = getHyperstackRegionOptions(catalog);

  const lambdaInstanceTypeOptions =
    selectedProvider === "lambda"
      ? getLambdaInstanceTypeOptions(catalog)
      : [];

  const nebiusInstanceTypeOptions =
    selectedProvider === "nebius"
      ? getNebiusInstanceTypeOptions(catalog)
      : [];

  const selectedLambdaInstanceType =
    selectedProvider === "lambda"
      ? lambdaInstanceTypeOptions.find(
          (opt) => opt.value === selectedMachineType,
        )?.entry
      : undefined;

  const lambdaRegionsFromCatalog = getLambdaRegionsFromCatalog(catalog);

  const lambdaRegionOptions =
    selectedProvider === "lambda"
      ? getLambdaRegionOptions(catalog, selectedLambdaInstanceType)
      : [];

  const nebiusRegionOptions = getNebiusRegionOptions(catalog);

  const regionOptions =
    selectedProvider === "hyperstack"
      ? hyperstackRegionOptions
      : selectedProvider === "lambda"
        ? lambdaRegionOptions
        : selectedProvider === "nebius"
          ? nebiusRegionOptions
          : getGcpRegionOptions(catalog);

  const zoneOptions =
    selectedProvider === "gcp"
      ? getGcpZoneOptions(catalog, selectedRegion)
      : [];

  const machineTypeOptions =
    selectedProvider === "gcp"
      ? getGcpMachineTypeOptions(catalog, selectedZone)
      : [];

  const hyperstackFlavorOptions =
    selectedProvider === "hyperstack"
      ? getHyperstackFlavorOptions(catalog, selectedRegion)
      : [];

  const gpuTypeOptions =
    selectedProvider === "gcp"
      ? getGcpGpuTypeOptions(catalog, selectedZone)
      : [];

  const imageOptions =
    selectedProvider === "gcp"
      ? getGcpImageOptions(catalog, selectedMachineType, selectedGpuType)
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
