import { Alert, Form, Select } from "antd";
import { React } from "@cocalc/frontend/app-framework";
import type { HostCreateViewModel } from "../hooks/use-host-create-view-model";
import type { HostFieldId } from "../providers/registry";

type HostCreateProviderFieldsProps = {
  provider: HostCreateViewModel["provider"];
};

export const HostCreateProviderFields: React.FC<HostCreateProviderFieldsProps> = ({
  provider,
}) => {
  const {
    providerOptions,
    selectedProvider,
    fields,
    catalogError,
  } = provider;
  const { schema, options, labels, tooltips } = fields;
  const renderField = (field: HostFieldId) => {
    const fieldOptions = options[field] ?? [];
    const label =
      labels[field] ??
      field
        .split("_")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
    const tooltip = tooltips[field];
    const isSourceImage = field === "source_image";
    return (
      <Form.Item
        key={field}
        name={field}
        label={label}
        tooltip={tooltip}
        initialValue={fieldOptions[0]?.value}
      >
        <Select
          options={fieldOptions}
          disabled={!fieldOptions.length}
          showSearch={isSourceImage}
          optionFilterProp="label"
          allowClear={isSourceImage}
        />
      </Form.Item>
    );
  };

  return (
    <>
      <Form.Item
        name="provider"
        label="Provider"
        initialValue={providerOptions[0]?.value ?? "gcp"}
      >
        <Select options={providerOptions} />
      </Form.Item>
      {schema.primary.map(renderField)}
      {catalogError && selectedProvider !== "none" && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message="Cloud catalog unavailable"
          description={catalogError}
        />
      )}
    </>
  );
};
