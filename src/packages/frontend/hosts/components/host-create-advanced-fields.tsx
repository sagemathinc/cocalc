import { Col, Form, Row, Select } from "antd";
import { React } from "@cocalc/frontend/app-framework";
import type { HostCreateViewModel } from "../hooks/use-host-create-view-model";
import { getDiskTypeOptions } from "../constants";
import type { HostFieldId } from "../providers/registry";

type HostCreateAdvancedFieldsProps = {
  provider: HostCreateViewModel["provider"];
};

export const HostCreateAdvancedFields: React.FC<
  HostCreateAdvancedFieldsProps
> = ({ provider }) => {
  const { selectedProvider, fields, storage } = provider;
  const form = Form.useFormInstance();
  const diskTypeOptions = getDiskTypeOptions(selectedProvider);
  const defaultDiskType =
    selectedProvider === "nebius"
      ? "ssd_io_m3"
      : diskTypeOptions[0]?.value;
  const { schema, options, labels, tooltips } = fields;
  const {
    storageModeOptions,
    supportsPersistentStorage,
    persistentGrowable,
    showDiskFields,
  } = storage;
  const watchedDiskType = Form.useWatch("disk_type", form);

  React.useEffect(() => {
    if (!diskTypeOptions.length) return;
    const hasDiskType =
      watchedDiskType &&
      diskTypeOptions.some((opt) => opt.value === watchedDiskType);
    if (!hasDiskType) {
      form.setFieldsValue({ disk_type: defaultDiskType });
    }
  }, [defaultDiskType, diskTypeOptions, form, watchedDiskType]);

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
              name="disk_type"
              label="Disk type"
              initialValue={defaultDiskType}
            >
              <Select
                options={diskTypeOptions}
                disabled={!diskTypeOptions.length}
              />
            </Form.Item>
          </Col>
        </>
      )}
    </Row>
  );
};
