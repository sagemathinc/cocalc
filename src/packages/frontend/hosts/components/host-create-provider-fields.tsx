import { Alert, Form, Select } from "antd";
import { React } from "@cocalc/frontend/app-framework";
import type { HostCreateViewModel } from "../hooks/use-host-create-view-model";
import { SIZES } from "../constants";

type HostCreateProviderFieldsProps = {
  provider: HostCreateViewModel["provider"];
};

export const HostCreateProviderFields: React.FC<HostCreateProviderFieldsProps> = ({
  provider,
}) => {
  const {
    providerOptions,
    selectedProvider,
    regionOptions,
    hyperstackFlavorOptions,
    lambdaInstanceTypeOptions,
    nebiusInstanceTypeOptions,
    catalogError,
  } = provider;
  const regionField = (
    <Form.Item
      name="region"
      label="Region"
      initialValue={regionOptions[0]?.value}
    >
      <Select options={regionOptions} disabled={selectedProvider === "none"} />
    </Form.Item>
  );

  return (
    <>
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
    </>
  );
};
