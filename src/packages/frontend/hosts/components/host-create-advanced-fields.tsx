import { Col, Form, Input, Row, Select, Slider } from "antd";
import { React } from "@cocalc/frontend/app-framework";
import type { HostCreateViewModel } from "../hooks/use-host-create-view-model";
import { DISK_TYPES } from "../constants";
import type { HostFieldId } from "../providers/registry";

type HostCreateAdvancedFieldsProps = {
  provider: HostCreateViewModel["provider"];
};

export const HostCreateAdvancedFields: React.FC<HostCreateAdvancedFieldsProps> = ({
  provider,
}) => {
  const {
    selectedProvider,
    fields,
    storage,
  } = provider;
  const { schema, options, labels, tooltips } = fields;
  const {
    storageModeOptions,
    supportsPersistentStorage,
    persistentGrowable,
    showDiskFields,
  } = storage;

  const renderField = (field: HostFieldId) => {
    const fieldOptions = options[field] ?? [];
    const label =
      labels[field] ??
      field
        .split("_")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
    const tooltip = tooltips[field];
    return (
      <Col span={24} key={field}>
        <Form.Item
          name={field}
          label={label}
          tooltip={tooltip}
          initialValue={fieldOptions[0]?.value}
        >
          <Select
            options={fieldOptions}
            disabled={!fieldOptions.length}
          />
        </Form.Item>
      </Col>
    );
  };

  return (
    <Row gutter={[12, 12]}>
      {schema.advanced.map(renderField)}
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
