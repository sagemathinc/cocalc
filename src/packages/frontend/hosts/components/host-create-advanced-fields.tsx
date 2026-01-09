import { Col, Form, Input, InputNumber, Row, Select, Slider } from "antd";
import { React } from "@cocalc/frontend/app-framework";
import type { HostCreateViewModel } from "../hooks/use-host-create-view-model";
import { DISK_TYPES } from "../constants";
import type { HostFieldId } from "../providers/registry";

const MIN_DISK_SIZE = 50;
const MAX_DISK_SIZE = 10_000;
// TODO for providers where this can't be enlarged... maybe it should be
// a much larger value by default?
const INITIAL_DISK_SIZE = 100;

type HostCreateAdvancedFieldsProps = {
  provider: HostCreateViewModel["provider"];
};

export const HostCreateAdvancedFields: React.FC<
  HostCreateAdvancedFieldsProps
> = ({ provider }) => {
  const form = Form.useFormInstance();
  const watchedDisk = Form.useWatch("disk", form);
  const diskValue =
    typeof watchedDisk === "number" && Number.isFinite(watchedDisk)
      ? watchedDisk
      : 100;
  const { selectedProvider, fields, storage } = provider;
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
          <Select options={fieldOptions} disabled={!fieldOptions.length} />
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
              label="Disk size (GB)"
              tooltip={`Disk for storing all projects on this host.  Files are compressed and deduplicated. ${
                persistentGrowable
                  ? "You can enlarge this disk at any time later."
                  : "This disk CANNOT be enlarged later."
              }`}
            >
              <Row gutter={12} align="middle">
                <Col flex="auto">
                  <Slider
                    min={MIN_DISK_SIZE}
                    max={MAX_DISK_SIZE}
                    step={1}
                    value={diskValue}
                    onChange={(value) => {
                      if (typeof value !== "number" || Number.isNaN(value)) {
                        return;
                      }
                      form.setFieldsValue({ disk: value });
                    }}
                  />
                </Col>
                <Col flex="120px">
                  <Form.Item
                    name="disk"
                    initialValue={INITIAL_DISK_SIZE}
                    noStyle
                  >
                    <InputNumber
                      min={MIN_DISK_SIZE}
                      max={MAX_DISK_SIZE}
                      step={1}
                      precision={0}
                      style={{ width: "100%" }}
                      onChange={(value) => {
                        if (typeof value !== "number" || Number.isNaN(value)) {
                          return;
                        }
                        form.setFieldsValue({ disk: value });
                      }}
                    />
                  </Form.Item>
                </Col>
              </Row>
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
