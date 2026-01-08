import { Alert, Form, Input, InputNumber, Modal, Select } from "antd";
import { React } from "@cocalc/frontend/app-framework";
import type { Host, HostCatalog } from "@cocalc/conat/hub/api/hosts";
import type { HostProvider } from "../types";
import {
  filterFieldSchemaForCaps,
  getProviderDescriptor,
  getProviderOptions,
  getProviderStorageSupport,
} from "../providers/registry";
import type { HostFieldId, ProviderSelection } from "../providers/registry";

type HostEditModalProps = {
  open: boolean;
  host?: Host;
  catalog?: HostCatalog;
  saving?: boolean;
  onCancel: () => void;
  onSave: (
    id: string,
    values: {
      name: string;
      cpu?: number;
      ram_gb?: number;
      disk_gb?: number;
      disk_type?: string;
      machine_type?: string;
      gpu_type?: string;
      storage_mode?: string;
      boot_disk_gb?: number;
      region?: string;
      zone?: string;
    },
  ) => Promise<void> | void;
};

export const HostEditModal: React.FC<HostEditModalProps> = ({
  open,
  host,
  catalog,
  saving,
  onCancel,
  onSave,
}) => {
  const [form] = Form.useForm();
  const isSelfHost = host?.machine?.cloud === "self-host";
  const isDeprovisioned = host?.status === "deprovisioned";
  const providerId = (host?.machine?.cloud ?? "none") as HostProvider;
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
    const gpuType =
      watchedGpuType && watchedGpuType !== "none" ? watchedGpuType : undefined;
    if (!gpuType) return null;
    const regionOption = (fieldOptions.region ?? []).find(
      (opt) => opt.value === watchedRegion,
    );
    const regionMeta = (regionOption?.meta ?? {}) as {
      compatible?: boolean;
      compatibleZone?: string;
    };
    if (regionMeta.compatible === false) {
      const compatibleRegions = (fieldOptions.region ?? []).filter((opt) => {
        const meta = opt.meta as { compatible?: boolean } | undefined;
        return meta?.compatible === true;
      });
      return { type: "region" as const, compatibleRegions };
    }
    if (!watchedZone) return null;
    const zoneOption = (fieldOptions.zone ?? []).find(
      (opt) => opt.value === watchedZone,
    );
    const zoneMeta = (zoneOption?.meta ?? {}) as {
      compatible?: boolean;
      region?: string;
    };
    if (zoneMeta.compatible !== false) return null;
    const compatibleZones = (fieldOptions.zone ?? []).filter((opt) => {
      const meta = opt.meta as { compatible?: boolean } | undefined;
      return meta?.compatible === true;
    });
    return { type: "zone" as const, compatibleZones };
  }, [
    fieldOptions.region,
    fieldOptions.zone,
    providerId,
    watchedGpuType,
    watchedRegion,
    watchedZone,
  ]);
  const storageSupport = providerDescriptor
    ? getProviderStorageSupport(providerId, catalog?.provider_capabilities)
    : { supported: false, growable: false };
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
  const bootDisk = readPositive(host?.machine?.metadata?.boot_disk_gb);
  const storageMode = host?.machine?.storage_mode ?? "persistent";
  const showDiskFields =
    isSelfHost ||
    isDeprovisioned ||
    (supportsDiskResize && storageMode !== "ephemeral");

  React.useEffect(() => {
    if (host) {
      form.setFieldsValue({
        name: host.name,
        cpu: currentCpu ?? 2,
        ram_gb: currentRam ?? 8,
        disk_gb: currentDisk ?? 100,
        region: host.region ?? undefined,
        zone: host.machine?.zone ?? undefined,
        machine_type: host.machine?.machine_type ?? undefined,
        gpu_type: host.machine?.gpu_type ?? "none",
        size: host.machine?.machine_type ?? host.size ?? undefined,
        storage_mode: storageMode,
        disk_type: host.machine?.disk_type ?? "balanced",
        boot_disk_gb: bootDisk ?? 20,
      });
    } else {
      form.resetFields();
    }
  }, [form, host, currentCpu, currentRam, currentDisk, storageMode, bootDisk]);
  React.useEffect(() => {
    const zoneOptions = fieldOptions.zone ?? [];
    if (!zoneOptions.length) return;
    const hasZone = watchedZone && zoneOptions.some((opt) => opt.value === watchedZone);
    if (!hasZone) {
      form.setFieldsValue({ zone: zoneOptions[0]?.value });
    }
  }, [fieldOptions.zone, form, watchedZone]);

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
    ensureFieldValue("region", watchedRegion);
  }, [ensureFieldValue, watchedRegion]);

  React.useEffect(() => {
    ensureFieldValue("zone", watchedZone);
  }, [ensureFieldValue, watchedZone]);

  React.useEffect(() => {
    ensureFieldValue("machine_type", watchedMachineType);
  }, [ensureFieldValue, watchedMachineType]);

  React.useEffect(() => {
    ensureFieldValue("size", watchedSize);
  }, [ensureFieldValue, watchedSize]);

  React.useEffect(() => {
    ensureFieldValue("gpu_type", watchedGpuType);
  }, [ensureFieldValue, watchedGpuType]);

  const renderField = (field: HostFieldId) => {
    const fieldOpts = fieldOptions[field] ?? [];
    const label =
      fieldSchema.labels?.[field] ??
      field
        .split("_")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
    const tooltip = fieldSchema.tooltips?.[field];
    return (
      <Form.Item
        key={field}
        name={field}
        label={label}
        tooltip={tooltip}
        initialValue={fieldOpts[0]?.value}
      >
        <Select options={fieldOpts} disabled={!fieldOpts.length} />
      </Form.Item>
    );
  };

  return (
    <Modal
      title="Edit host"
      open={open}
      onCancel={onCancel}
      onOk={handleOk}
      confirmLoading={saving}
      okText="Save"
      destroyOnClose
    >
      <Form form={form} layout="vertical">
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
        {isDeprovisioned &&
          providerDescriptor &&
          fieldSchema.primary.map(renderField)}
        {isDeprovisioned && gcpCompatibilityWarning?.type === "region" && (
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 12 }}
            message="Selected GPU isn't available in this region."
            description={
              gcpCompatibilityWarning.compatibleRegions.length ? (
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
                "Try a different GPU."
              )
            }
          />
        )}
        {isDeprovisioned && gcpCompatibilityWarning?.type === "zone" && (
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 12 }}
            message="Selected GPU isn't available in this zone."
            description={
              gcpCompatibilityWarning.compatibleZones.length ? (
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
                "Try a different region to use this GPU."
              )
            }
          />
        )}
        {isSelfHost && (
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
        {showDiskFields && (
          <Form.Item
            label="Disk size (GB)"
            name="disk_gb"
            tooltip={
              isDeprovisioned
                ? "Disk size is applied on next provision."
                : "Disk can only grow while provisioned."
            }
            extra={
              diskResizeBlocked
                ? "Stop the VM before resizing the disk."
                : isDeprovisioned
                  ? undefined
                  : `Current minimum: ${diskMin} GB (grow only)`
            }
          >
            <InputNumber
              min={diskMin}
              max={diskMax}
              style={{ width: "100%" }}
              disabled={diskResizeBlocked}
            />
          </Form.Item>
        )}
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
            <Form.Item
              label="Disk type"
              name="disk_type"
            >
              <Select
                options={[
                  { value: "balanced", label: "Balanced" },
                  { value: "ssd", label: "SSD" },
                  { value: "standard", label: "Standard" },
                ]}
              />
            </Form.Item>
            <Form.Item
              label="Boot disk size (GB)"
              name="boot_disk_gb"
            >
              <InputNumber min={10} max={200} style={{ width: "100%" }} />
            </Form.Item>
          </>
        )}
      </Form>
    </Modal>
  );
};
