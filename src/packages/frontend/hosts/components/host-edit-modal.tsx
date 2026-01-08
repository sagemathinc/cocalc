import { Form, Input, InputNumber, Modal, Select } from "antd";
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
  const selection: ProviderSelection = {
    region: host?.region ?? undefined,
    zone: host?.machine?.zone ?? undefined,
    machine_type: host?.machine?.machine_type ?? undefined,
    gpu_type: host?.machine?.gpu_type ?? undefined,
    size: host?.machine?.machine_type ?? host?.size ?? undefined,
    gpu: host?.gpu ? "true" : undefined,
  };
  const fieldOptions = providerDescriptor
    ? getProviderOptions(providerId, catalog, selection)
    : {};
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

  const handleOk = async () => {
    const values = await form.validateFields();
    if (!host) return;
    await onSave(host.id, values);
  };

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
