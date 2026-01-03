import { useEffect, useMemo, useRef } from "@cocalc/frontend/app-framework";
import type { FormInstance } from "antd";
import type { HostCatalog } from "@cocalc/conat/hub/api/hosts";
import type { HostProvider, HostRecommendation } from "../types";
import { buildCatalogSummary } from "../utils/normalize-catalog";
import {
  HOST_FIELDS,
  buildRecommendationUpdate,
  getProviderDescriptor,
  getProviderStorageSupport,
  getProviderOptions,
  filterFieldSchemaForCaps,
  type HostFieldId,
  type ProviderSelection,
  type FieldOptionsMap,
  type ProviderFieldSchema,
} from "../providers/registry";

type SelectOption = { value: string; disabled?: boolean };

type UseHostFormArgs = {
  form: FormInstance;
  catalog?: HostCatalog;
  selectedProvider?: HostProvider;
  selectedRegion?: string;
  selectedZone?: string;
  selectedMachineType?: string;
  selectedGpuType?: string;
  selectedSize?: string;
  selectedGpu?: string;
  selectedStorageMode?: string;
  enabledProviders: HostProvider[];
};

const FIELD_LABELS: Record<HostFieldId, string> = {
  region: "Region",
  zone: "Zone",
  machine_type: "Machine type",
  gpu_type: "GPU",
  size: "Size",
  gpu: "GPU",
};

const inOptions = (value: string | undefined, options?: SelectOption[]) =>
  value !== undefined && value !== null && !!options?.some((opt) => opt.value === value);

const firstValue = (options?: SelectOption[]) =>
  options?.find((opt) => !opt.disabled)?.value ?? options?.[0]?.value;

export const useHostForm = ({
  form,
  catalog,
  selectedProvider,
  selectedRegion,
  selectedZone,
  selectedMachineType,
  selectedGpuType,
  selectedSize,
  selectedGpu,
  selectedStorageMode,
  enabledProviders,
}: UseHostFormArgs) => {
  const prevProviderRef = useRef<HostProvider | undefined>(undefined);
  const provider = selectedProvider ?? "none";
  const providerCaps = useMemo(() => {
    if (!catalog?.provider_capabilities) return undefined;
    return catalog.provider_capabilities[provider];
  }, [catalog, provider]);
  const fieldSchema: ProviderFieldSchema = useMemo(
    () =>
      filterFieldSchemaForCaps(
        getProviderDescriptor(provider).fields,
        providerCaps,
      ),
    [provider, providerCaps],
  );
  const selection: ProviderSelection = useMemo(
    () => ({
      region: selectedRegion,
      zone: selectedZone,
      machine_type: selectedMachineType,
      gpu_type: selectedGpuType,
      size: selectedSize,
      gpu: selectedGpu,
    }),
    [
      selectedRegion,
      selectedZone,
      selectedMachineType,
      selectedGpuType,
      selectedSize,
      selectedGpu,
    ],
  );
  const fieldOptions: FieldOptionsMap = useMemo(
    () => getProviderOptions(provider, catalog, selection),
    [provider, catalog, selection],
  );
  const fieldLabels = useMemo(
    () => ({
      ...FIELD_LABELS,
      ...(fieldSchema.labels ?? {}),
    }),
    [fieldSchema],
  );
  const fieldTooltips = useMemo(
    () => fieldSchema.tooltips ?? {},
    [fieldSchema],
  );

  const storageSupport = useMemo(
    () => getProviderStorageSupport(provider, catalog?.provider_capabilities),
    [provider, catalog],
  );
  const supportsPersistentStorage = storageSupport.supported;
  const persistentGrowable = storageSupport.growable ?? true;
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

  const catalogSummary = useMemo(
    () =>
      buildCatalogSummary({
        catalog,
        enabledProviders,
      }),
    [catalog, enabledProviders],
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
    const providerChanged = provider !== prevProviderRef.current;
    if (providerChanged) {
      prevProviderRef.current = provider;
    }

    if (providerChanged) {
      const activeFields = new Set<HostFieldId>([
        ...fieldSchema.primary,
        ...fieldSchema.advanced,
      ]);
      for (const field of HOST_FIELDS) {
        if (!activeFields.has(field)) {
          updates[field] = undefined;
        }
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

    const currentValues: Record<HostFieldId, string | undefined> = {
      region: selectedRegion,
      zone: selectedZone,
      machine_type: selectedMachineType,
      gpu_type: selectedGpuType,
      size: selectedSize,
      gpu: selectedGpu,
    };

    for (const field of [...fieldSchema.primary, ...fieldSchema.advanced]) {
      ensureValue(
        field,
        currentValues[field],
        fieldOptions[field],
      );
    }

    if (Object.keys(updates).length > 0) {
      form.setFieldsValue(updates);
    }
  }, [
    form,
    provider,
    selectedRegion,
    selectedZone,
    selectedMachineType,
    selectedGpuType,
    selectedSize,
    selectedGpu,
    fieldSchema,
    fieldOptions,
  ]);

  const applyRecommendation = (rec: HostRecommendation) => {
    const next = buildRecommendationUpdate(rec);
    if (Object.keys(next).length === 0) return;
    form.setFieldsValue(next);
  };

  return {
    providerCaps,
    fieldSchema,
    fieldOptions,
    fieldLabels,
    fieldTooltips,
    supportsPersistentStorage,
    persistentGrowable,
    storageModeOptions,
    showDiskFields,
    catalogSummary,
    applyRecommendation,
  };
};
