import { Alert, Col, Collapse, Form, Input, Row, Select, Slider } from "antd";
import { React } from "@cocalc/frontend/app-framework";
import type { FormInstance } from "antd/es/form";
import type { HostCreateViewModel } from "../hooks/use-host-create-view-model";
import { DISK_TYPES, GPU_TYPES, SIZES } from "../constants";

type HostCreateFormProps = {
  form: FormInstance;
  canCreateHosts: boolean;
  provider: HostCreateViewModel["provider"];
  onCreate: (vals: any) => Promise<void>;
};

export const HostCreateForm: React.FC<HostCreateFormProps> = ({
  form,
  canCreateHosts,
  provider,
  onCreate,
}) => {
  const {
    providerOptions,
    selectedProvider,
    regionOptions,
    hyperstackFlavorOptions,
    lambdaInstanceTypeOptions,
    nebiusInstanceTypeOptions,
    zoneOptions,
    machineTypeOptions,
    imageOptions,
    gpuTypeOptions,
    storageModeOptions,
    supportsPersistentStorage,
    persistentGrowable,
    showDiskFields,
    catalogError,
  } = provider;
  const regionField = (
    <Form.Item name="region" label="Region" initialValue={regionOptions[0]?.value}>
      <Select options={regionOptions} disabled={selectedProvider === "none"} />
    </Form.Item>
  );

  return (
    <Form
      layout="vertical"
      onFinish={onCreate}
      disabled={!canCreateHosts}
      form={form}
    >
      <Form.Item name="name" label="Name" initialValue="My host">
        <Input placeholder="My host" />
      </Form.Item>
      <Form.Item
        name="provider"
        label="Provider"
        initialValue={providerOptions[0]?.value ?? "gcp"}
      >
        <Select options={providerOptions} />
      </Form.Item>
      {selectedProvider === "lambda" || selectedProvider === "nebius"
        ? null
        : regionField}
      {selectedProvider === "none" && (
        <Form.Item name="size" label="Size" initialValue={SIZES[0].value}>
          <Select options={SIZES} />
        </Form.Item>
      )}
      {selectedProvider === "hyperstack" && (
        <Form.Item
          name="size"
          label="Size"
          initialValue={hyperstackFlavorOptions[0]?.value}
        >
          <Select options={hyperstackFlavorOptions} />
        </Form.Item>
      )}
      {selectedProvider === "lambda" && (
        <>
          <Form.Item
            name="machine_type"
            label="Instance type"
            initialValue={lambdaInstanceTypeOptions[0]?.value}
          >
            <Select options={lambdaInstanceTypeOptions} />
          </Form.Item>
          {regionField}
        </>
      )}
      {selectedProvider === "nebius" && (
        <>
          <Form.Item
            name="machine_type"
            label="Instance type"
            initialValue={nebiusInstanceTypeOptions[0]?.value}
          >
            <Select options={nebiusInstanceTypeOptions} />
          </Form.Item>
          {regionField}
        </>
      )}
      {catalogError && selectedProvider === "gcp" && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message="Cloud catalog unavailable"
          description={catalogError}
        />
      )}
      <Collapse ghost style={{ marginBottom: 8 }}>
        <Collapse.Panel header="Advanced options" key="adv">
          <Row gutter={[12, 12]}>
            {selectedProvider === "gcp" && (
              <>
                <Col span={24}>
                  <Form.Item
                    name="zone"
                    label="Zone"
                    initialValue={zoneOptions[0]?.value}
                    tooltip="Zones are derived from the selected region."
                  >
                    <Select options={zoneOptions} />
                  </Form.Item>
                </Col>
                <Col span={24}>
                  <Form.Item
                    name="machine_type"
                    label="Machine type"
                    initialValue={machineTypeOptions[0]?.value}
                  >
                    <Select options={machineTypeOptions} />
                  </Form.Item>
                </Col>
                <Col span={24}>
                  <Form.Item
                    name="source_image"
                    label="Base image"
                    tooltip="Optional override; leave blank for the default Ubuntu image."
                  >
                    <Select
                      options={[
                        { value: "", label: "Default (Ubuntu LTS)" },
                        ...imageOptions,
                      ]}
                      showSearch
                      optionFilterProp="label"
                      allowClear
                    />
                  </Form.Item>
                </Col>
                <Col span={24}>
                  <Form.Item name="gpu_type" label="GPU" initialValue="none">
                    <Select
                      options={[
                        { value: "none", label: "No GPU" },
                        ...gpuTypeOptions,
                      ]}
                    />
                  </Form.Item>
                </Col>
              </>
            )}
            {selectedProvider !== "gcp" &&
              selectedProvider !== "lambda" &&
              selectedProvider !== "hyperstack" &&
              selectedProvider !== "nebius" && (
                <Col span={24}>
                  <Form.Item
                    name="gpu"
                    label="GPU"
                    initialValue="none"
                    tooltip="Only needed for GPU workloads."
                  >
                    <Select options={GPU_TYPES} />
                  </Form.Item>
                </Col>
              )}
            {selectedProvider !== "none" && (
              <Col span={24}>
                <Form.Item
                  name="storage_mode"
                  label="Storage mode"
                  initialValue="persistent"
                  tooltip={
                    supportsPersistentStorage
                      ? persistentGrowable
                        ? "Ephemeral uses fast local disks; persistent uses a separate growable disk."
                        : "Ephemeral uses fast local disks; persistent uses a separate fixed-size disk."
                      : "Only ephemeral storage is available for this provider."
                  }
                >
                  <Select
                    options={storageModeOptions}
                    disabled={!supportsPersistentStorage}
                  />
                </Form.Item>
              </Col>
            )}
            {showDiskFields && (
              <>
                <Col span={24}>
                  <Form.Item
                    name="disk"
                    label="Disk size (GB)"
                    initialValue={100}
                    tooltip={`Disk for storing all projects on this host.  Files are compressed and deduplicated. ${
                      persistentGrowable
                        ? "You can enlarge this disk at any time later."
                        : "This disk CANNOT be enlarged later."
                    }`}
                  >
                    <Slider min={50} max={1000} step={50} />
                  </Form.Item>
                </Col>
                <Col span={24}>
                  <Form.Item
                    name="disk_type"
                    label="Disk type"
                    initialValue={DISK_TYPES[0].value}
                  >
                    <Select options={DISK_TYPES} />
                  </Form.Item>
                </Col>
                <Col span={24}>
                  <Form.Item
                    name="boot_disk_gb"
                    label="Boot disk size (GB)"
                    initialValue={20}
                  >
                    <Slider min={10} max={200} step={5} />
                  </Form.Item>
                </Col>
              </>
            )}
            <Col span={24}>
              <Form.Item
                name="shared"
                label="Shared volume"
                tooltip="Optional Btrfs subvolume bind-mounted into projects on this host."
                initialValue="none"
              >
                <Select
                  options={[
                    { value: "none", label: "None" },
                    { value: "rw", label: "Shared volume (rw)" },
                    { value: "ro", label: "Shared volume (ro)" },
                  ]}
                />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item
                name="bucket"
                label="Mount bucket (gcsfuse)"
                tooltip="Optional bucket to mount via gcsfuse on this host."
              >
                <Input placeholder="bucket-name (optional)" />
              </Form.Item>
            </Col>
          </Row>
        </Collapse.Panel>
      </Collapse>
    </Form>
  );
};
