import { Alert, Collapse, Form, Input, InputNumber, Modal, Select } from "antd";
import { React } from "@cocalc/frontend/app-framework";
import type { Host, HostCatalog } from "@cocalc/conat/hub/api/hosts";
import type { HostProvider } from "../types";
import { getDiskTypeOptions } from "../constants";
import { HostCreateForm } from "./host-create-form";
import { useHostForm } from "../hooks/use-host-form";
import { useHostFormValues } from "../hooks/use-host-form-values";
import {
  filterFieldSchemaForCaps,
  getProviderDescriptor,
  getProviderOptions,
  getProviderStorageSupport,
} from "../providers/registry";
import type { HostFieldId, ProviderSelection } from "../providers/registry";

const NEBIUS_IO_M3_GB = 93;

type HostEditModalProps = {
  open: boolean;
  host?: Host;
  catalog?: HostCatalog;
  providerOptions?: Array<{ value: HostProvider; label: string }>;
  catalogError?: string;
  saving?: boolean;
  onCancel: () => void;
  onSave: (
    id: string,
    values: {
      name: string;
      provider?: HostProvider;
      cpu?: number;
      ram_gb?: number;
      disk_gb?: number;
      disk_type?: string;
      machine_type?: string;
      gpu_type?: string;
      storage_mode?: string;
      region?: string;
      zone?: string;
    },
  ) => Promise<void> | void;
  onProviderChange?: (provider: HostProvider) => void;
};

export const HostEditModal: React.FC<HostEditModalProps> = ({
  open,
  host,
  catalog,
  providerOptions = [],
  catalogError,
  saving,
  onCancel,
  onSave,
  onProviderChange,
}) => {
  const [form] = Form.useForm();
  const isSelfHost = host?.machine?.cloud === "self-host";
  const isDeprovisioned = host?.status === "deprovisioned";
  const isStopped = host?.status === "off";
  const canEditMachine = isDeprovisioned || isStopped;
  const lockRegionZone = isStopped && !isDeprovisioned;
  const watchedProvider = Form.useWatch("provider", form) as
    | HostProvider
    | undefined;
  const hostProviderId = (host?.machine?.cloud ?? "none") as HostProvider;
  const providerId = isDeprovisioned
    ? (watchedProvider ?? hostProviderId)
    : hostProviderId;
  const enabledProviders = React.useMemo(
    () => providerOptions.map((option) => option.value),
    [providerOptions],
  );
  const {
    selectedRegion,
    selectedZone,
    selectedMachineType,
    selectedGpuType,
    selectedGpu,
    selectedSize,
    selectedStorageMode,
  } = useHostFormValues(form);
  const {
    fieldSchema: createFieldSchema,
    fieldOptions: createFieldOptions,
    fieldLabels: createFieldLabels,
    fieldTooltips: createFieldTooltips,
    supportsPersistentStorage,
    persistentGrowable,
    storageModeOptions,
    showDiskFields: createShowDiskFields,
  } = useHostForm({
    form,
    catalog,
    selectedProvider: providerId,
    selectedRegion,
    selectedZone,
    selectedMachineType,
    selectedGpuType,
    selectedSize,
    selectedGpu,
    selectedStorageMode,
    enabledProviders,
  });
  const createProviderVm = React.useMemo(
    () => ({
      providerOptions,
      selectedProvider: providerId ?? providerOptions[0]?.value ?? "none",
      fields: {
        schema: createFieldSchema,
        options: createFieldOptions,
        labels: createFieldLabels,
        tooltips: createFieldTooltips,
      },
      storage: {
        storageModeOptions,
        supportsPersistentStorage,
        persistentGrowable,
        showDiskFields: createShowDiskFields,
      },
      catalogError,
    }),
    [
      providerOptions,
      providerId,
      createFieldSchema,
      createFieldOptions,
      createFieldLabels,
      createFieldTooltips,
      storageModeOptions,
      supportsPersistentStorage,
      persistentGrowable,
      createShowDiskFields,
      catalogError,
    ],
  );
  const handleProviderChange = (value: HostProvider) => {
    onProviderChange?.(value);
  };
  const providerCaps =
    providerId && catalog?.provider_capabilities
      ? catalog.provider_capabilities[providerId]
      : undefined;
  const providerDescriptor =
    providerId !== "none" ? getProviderDescriptor(providerId) : undefined;
  const fieldSchema = providerDescriptor
    ? filterFieldSchemaForCaps(providerDescriptor.fields, providerCaps)
    : { primary: [], advanced: [] };
  const watchedRegion = Form.useWatch("region", form);
  const watchedZone = Form.useWatch("zone", form);
  const watchedMachineType = Form.useWatch("machine_type", form);
  const watchedGpuType = Form.useWatch("gpu_type", form);
  const watchedSize = Form.useWatch("size", form);
  const selection: ProviderSelection = {
    region: watchedRegion ?? host?.region ?? undefined,
    zone: watchedZone ?? host?.machine?.zone ?? undefined,
    machine_type: watchedMachineType ?? host?.machine?.machine_type ?? undefined,
    gpu_type: watchedGpuType ?? host?.machine?.gpu_type ?? undefined,
    size:
      watchedMachineType ??
      watchedSize ??
      host?.machine?.machine_type ??
      host?.size ??
      undefined,
    gpu: host?.gpu ? "true" : undefined,
  };
  const fieldOptions = providerDescriptor
    ? getProviderOptions(providerId, catalog, selection)
    : {};
  const gcpCompatibilityWarning = React.useMemo(() => {
    if (providerId !== "gcp") return null;
    const compatibilityOptions = isDeprovisioned
      ? createFieldOptions
      : fieldOptions;
    const gpuType =
      watchedGpuType && watchedGpuType !== "none" ? watchedGpuType : undefined;
    if (!gpuType) return null;
    const regionOption = (compatibilityOptions.region ?? []).find(
      (opt) => opt.value === watchedRegion,
    );
    const regionMeta = (regionOption?.meta ?? {}) as {
      compatible?: boolean;
      compatibleZone?: string;
    };
    if (regionMeta.compatible === false) {
      const compatibleRegions = (compatibilityOptions.region ?? []).filter((opt) => {
        const meta = opt.meta as { compatible?: boolean } | undefined;
        return meta?.compatible === true;
      });
      return { type: "region" as const, compatibleRegions };
    }
    if (!watchedZone) return null;
    const zoneOption = (compatibilityOptions.zone ?? []).find(
      (opt) => opt.value === watchedZone,
    );
    const zoneMeta = (zoneOption?.meta ?? {}) as {
      compatible?: boolean;
      region?: string;
    };
    if (zoneMeta.compatible !== false) return null;
    const compatibleZones = (compatibilityOptions.zone ?? []).filter((opt) => {
      const meta = opt.meta as { compatible?: boolean } | undefined;
      return meta?.compatible === true;
    });
    return { type: "zone" as const, compatibleZones };
  }, [
    createFieldOptions,
    fieldOptions.region,
    fieldOptions.zone,
    isDeprovisioned,
    providerId,
    watchedGpuType,
    watchedRegion,
    watchedZone,
  ]);
  const storageSupport = providerDescriptor
    ? getProviderStorageSupport(providerId, catalog?.provider_capabilities)
    : { supported: false, growable: false };
  const diskTypeOptions = getDiskTypeOptions(providerId);
  const defaultDiskType =
    providerId === "nebius" ? "ssd_io_m3" : diskTypeOptions[0]?.value;
  const supportsDiskResize = !!providerCaps?.supportsDiskResize;
  const diskResizeRequiresStop = !!providerCaps?.diskResizeRequiresStop;
  const diskResizeBlocked =
    !isSelfHost &&
    !isDeprovisioned &&
    diskResizeRequiresStop &&
    host?.status !== "off";
  const readPositive = (value: unknown) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
    return Math.floor(parsed);
  };
  const currentCpu = readPositive(host?.machine?.metadata?.cpu);
  const currentRam = readPositive(host?.machine?.metadata?.ram_gb);
  const currentDisk = readPositive(host?.machine?.disk_gb);
  const diskMin = isDeprovisioned ? 10 : currentDisk ?? 10;
  const diskMax = Math.max(2000, diskMin);
  const watchedDiskType = Form.useWatch("disk_type", form);
  const isNebiusIoM3 = providerId === "nebius" && watchedDiskType === "ssd_io_m3";
  const diskStep = isNebiusIoM3 ? NEBIUS_IO_M3_GB : 1;
  const diskMinAdjusted = isNebiusIoM3
    ? Math.ceil(diskMin / NEBIUS_IO_M3_GB) * NEBIUS_IO_M3_GB
    : diskMin;
  const normalizeDiskValue = React.useCallback(
    (value: number) => {
      if (!isNebiusIoM3) return value;
      const rounded = Math.ceil(value / NEBIUS_IO_M3_GB) * NEBIUS_IO_M3_GB;
      return Math.max(diskMinAdjusted, rounded);
    },
    [diskMinAdjusted, isNebiusIoM3],
  );
  const storageMode = host?.machine?.storage_mode ?? "persistent";
  const showDiskFields =
    isSelfHost ||
    isDeprovisioned ||
    (supportsDiskResize && storageMode !== "ephemeral");
  const showAdvancedSection =
    isDeprovisioned &&
    ((providerDescriptor && fieldSchema.advanced.length > 0) ||
      storageSupport.supported);
  const initRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!open) {
      initRef.current = null;
      return;
    }
    if (!host) {
      initRef.current = null;
      form.resetFields();
      return;
    }
    if (initRef.current === host.id) return;
    initRef.current = host.id;
    form.setFieldsValue({
      name: host.name,
      provider: host.machine?.cloud ?? providerOptions[0]?.value,
      cpu: currentCpu ?? 2,
      ram_gb: currentRam ?? 8,
      disk_gb: currentDisk ?? 100,
      disk: currentDisk ?? 100,
      region: host.region ?? undefined,
      zone: host.machine?.zone ?? undefined,
      machine_type: host.machine?.machine_type ?? undefined,
      gpu_type: host.machine?.gpu_type ?? "none",
      size: host.machine?.machine_type ?? host.size ?? undefined,
      storage_mode: storageMode,
      disk_type: host.machine?.disk_type,
    });
  }, [
    currentCpu,
    currentDisk,
    currentRam,
    form,
    host,
    open,
    providerOptions,
    storageMode,
  ]);
  React.useEffect(() => {
    if (!isDeprovisioned) return;
    if (!diskTypeOptions.length) return;
    const hasDiskType =
      watchedDiskType &&
      diskTypeOptions.some((opt) => opt.value === watchedDiskType);
    if (!hasDiskType) {
      form.setFieldsValue({ disk_type: defaultDiskType });
    }
  }, [
    defaultDiskType,
    diskTypeOptions,
    form,
    isDeprovisioned,
    watchedDiskType,
  ]);
  React.useEffect(() => {
    if (isDeprovisioned) return;
    if (lockRegionZone) return;
    const zoneOptions = fieldOptions.zone ?? [];
    if (!zoneOptions.length) return;
    const hasZone = watchedZone && zoneOptions.some((opt) => opt.value === watchedZone);
    if (!hasZone) {
      form.setFieldsValue({ zone: zoneOptions[0]?.value });
    }
  }, [fieldOptions.zone, form, isDeprovisioned, lockRegionZone, watchedZone]);

  const handleOk = async () => {
    const values = await form.validateFields();
    if (!host) return;
    await onSave(host.id, values);
  };

  const ensureFieldValue = React.useCallback(
    (field: "region" | "zone" | "machine_type" | "size" | "gpu_type", current?: string) => {
      const options = fieldOptions[field] ?? [];
      if (!options.length) return;
      if (!current || !options.some((opt) => opt.value === current)) {
        form.setFieldsValue({ [field]: options[0]?.value });
      }
    },
    [fieldOptions, form],
  );

  React.useEffect(() => {
    if (isDeprovisioned) return;
    if (lockRegionZone) return;
    ensureFieldValue("region", watchedRegion);
  }, [ensureFieldValue, isDeprovisioned, lockRegionZone, watchedRegion]);

  React.useEffect(() => {
    if (isDeprovisioned) return;
    if (lockRegionZone) return;
    ensureFieldValue("zone", watchedZone);
  }, [ensureFieldValue, isDeprovisioned, lockRegionZone, watchedZone]);

  React.useEffect(() => {
    if (isDeprovisioned) return;
    ensureFieldValue("machine_type", watchedMachineType);
  }, [ensureFieldValue, isDeprovisioned, watchedMachineType]);

  React.useEffect(() => {
    if (isDeprovisioned) return;
    ensureFieldValue("size", watchedSize);
  }, [ensureFieldValue, isDeprovisioned, watchedSize]);

  React.useEffect(() => {
    if (isDeprovisioned) return;
    ensureFieldValue("gpu_type", watchedGpuType);
  }, [ensureFieldValue, isDeprovisioned, watchedGpuType]);

  const renderField = (field: HostFieldId) => {
    const fieldOpts = fieldOptions[field] ?? [];
    const label =
      fieldSchema.labels?.[field] ??
      field
        .split("_")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
    const tooltip = fieldSchema.tooltips?.[field];
    const isLocked = lockRegionZone && (field === "region" || field === "zone");
    return (
      <Form.Item
        key={field}
        name={field}
        label={label}
        tooltip={tooltip}
        initialValue={fieldOpts[0]?.value}
      >
        <Select options={fieldOpts} disabled={!fieldOpts.length || isLocked} />
      </Form.Item>
    );
  };

  const disableSave = !!gcpCompatibilityWarning;

  return (
    <Modal
      title="Edit host"
      open={open}
      onCancel={onCancel}
      onOk={handleOk}
      confirmLoading={saving}
      okText="Save"
      okButtonProps={{ disabled: disableSave }}
      destroyOnClose
    >
      <Form form={form} layout="vertical">
        {isDeprovisioned ? (
          <HostCreateForm
            form={form}
            canCreateHosts={true}
            provider={createProviderVm}
            onProviderChange={handleProviderChange}
            wrapForm={false}
          />
        ) : (
          <>
            <Form.Item
              label="Name"
              name="name"
              rules={[
                { required: true, message: "Please enter a name" },
                { max: 100, message: "Name is too long" },
              ]}
            >
              <Input placeholder="Host name" />
            </Form.Item>
            {canEditMachine &&
              providerDescriptor &&
              fieldSchema.primary.map(renderField)}
          </>
        )}
        {canEditMachine && gcpCompatibilityWarning?.type === "region" && (
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 12 }}
            message="Selected GPU isn't available in this region."
            description={
              gcpCompatibilityWarning.compatibleRegions.length && !lockRegionZone ? (
                <Select
                  placeholder="Choose a compatible region"
                  options={gcpCompatibilityWarning.compatibleRegions}
                  onChange={(value) => {
                    const regionOption =
                      gcpCompatibilityWarning.compatibleRegions.find(
                        (opt) => opt.value === value,
                      );
                    const meta = (regionOption?.meta ?? {}) as {
                      compatibleZone?: string;
                    };
                    form.setFieldsValue({
                      region: value,
                      zone: meta.compatibleZone ?? undefined,
                    });
                  }}
                />
              ) : (
                "Choose a GPU compatible with the selected region."
              )
            }
          />
        )}
        {canEditMachine && gcpCompatibilityWarning?.type === "zone" && (
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 12 }}
            message="Selected GPU isn't available in this zone."
            description={
              gcpCompatibilityWarning.compatibleZones.length && !lockRegionZone ? (
                <Select
                  placeholder="Choose a compatible zone"
                  options={gcpCompatibilityWarning.compatibleZones}
                  onChange={(value) => {
                    const zoneOption = gcpCompatibilityWarning.compatibleZones.find(
                      (opt) => opt.value === value,
                    );
                    const meta = (zoneOption?.meta ?? {}) as { region?: string };
                    form.setFieldsValue({
                      zone: value,
                      region: meta.region ?? undefined,
                    });
                  }}
                />
              ) : (
                "Choose a GPU compatible with the selected zone."
              )
            }
          />
        )}
        {!isDeprovisioned && isSelfHost && (
          <>
            <Form.Item
              label="vCPU"
              name="cpu"
              tooltip="Update requires a brief stop/start of the VM."
              extra="Safe range: 1–64 vCPU"
            >
              <InputNumber min={1} max={64} style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item
              label="Memory (GB)"
              name="ram_gb"
              tooltip="Update requires a brief stop/start of the VM."
              extra="Safe range: 1–512 GB"
            >
              <InputNumber min={1} max={512} style={{ width: "100%" }} />
            </Form.Item>
          </>
        )}
        {!isDeprovisioned && showDiskFields && (
          <Form.Item
            label="Disk size (GB)"
            name="disk_gb"
            tooltip={
              isDeprovisioned
                ? "Disk size is applied on next provision."
                : `Disk can only grow while provisioned.${
                    isNebiusIoM3 ? " SSD IO M3 requires multiples of 93 GB." : ""
                  }`
            }
            extra={
              diskResizeBlocked
                ? "Stop the VM before resizing the disk."
                : isDeprovisioned
                  ? undefined
                  : `Current minimum: ${diskMinAdjusted} GB (grow only)`
            }
          >
            <InputNumber
              min={diskMinAdjusted}
              max={diskMax}
              step={diskStep}
              style={{ width: "100%" }}
              disabled={diskResizeBlocked}
              onChange={(value) => {
                if (typeof value !== "number" || Number.isNaN(value)) {
                  return;
                }
                const normalized = normalizeDiskValue(value);
                if (normalized !== value) {
                  form.setFieldsValue({ disk_gb: normalized });
                }
              }}
            />
          </Form.Item>
        )}
        {!isDeprovisioned && showAdvancedSection && (
          <Collapse ghost style={{ marginBottom: 8 }}>
            <Collapse.Panel header="Advanced options" key="advanced">
              {providerDescriptor &&
                fieldSchema.advanced.map(renderField)}
              {isDeprovisioned && storageSupport.supported && (
                <>
                  <Form.Item
                    label="Storage mode"
                    name="storage_mode"
                    tooltip="Ephemeral uses local disks; persistent uses a separate disk."
                  >
                    <Select
                      options={[
                        { value: "ephemeral", label: "Ephemeral (local)" },
                        {
                          value: "persistent",
                          label: storageSupport.growable
                            ? "Persistent (growable disk)"
                            : "Persistent (fixed size)",
                        },
                      ]}
                    />
                  </Form.Item>
                  <Form.Item label="Disk type" name="disk_type">
                    <Select
                      options={diskTypeOptions}
                      disabled={!diskTypeOptions.length}
                    />
                  </Form.Item>
                </>
              )}
            </Collapse.Panel>
          </Collapse>
        )}
      </Form>
    </Modal>
  );
};
