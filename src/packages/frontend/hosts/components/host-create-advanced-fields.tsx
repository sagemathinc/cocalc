import { Col, Form, Input, Row, Select, Slider } from "antd";
import { React } from "@cocalc/frontend/app-framework";
import type { HostCreateViewModel } from "../hooks/use-host-create-view-model";
import { DISK_TYPES, GPU_TYPES } from "../constants";

type HostCreateAdvancedFieldsProps = {
  provider: HostCreateViewModel["provider"];
};

export const HostCreateAdvancedFields: React.FC<HostCreateAdvancedFieldsProps> = ({
  provider,
}) => {
  const {
    selectedProvider,
    zoneOptions,
    machineTypeOptions,
    imageOptions,
    gpuTypeOptions,
    storageModeOptions,
    supportsPersistentStorage,
    persistentGrowable,
    showDiskFields,
  } = provider;

  return (
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
  );
};
