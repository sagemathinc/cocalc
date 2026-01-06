import { Alert, Form, InputNumber, Select } from "antd";
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
        />
      </Form.Item>
    );
  };

  return (
    <>
      <Form.Item
        name="provider"
        label="Provider"
        initialValue={providerOptions[0]?.value ?? "none"}
      >
        <Select options={providerOptions} />
      </Form.Item>
      {schema.primary.map(renderField)}
      {selectedProvider === "self-host" && (
        <>
          <Form.Item
            name="cpu"
            label="vCPU"
            tooltip="Number of virtual CPUs for this VM."
            initialValue={2}
          >
            <InputNumber min={1} max={128} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item
            name="ram_gb"
            label="Memory (GB)"
            tooltip="RAM to allocate to this VM."
            initialValue={8}
          >
            <InputNumber min={1} max={512} style={{ width: "100%" }} />
          </Form.Item>
        </>
      )}
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
