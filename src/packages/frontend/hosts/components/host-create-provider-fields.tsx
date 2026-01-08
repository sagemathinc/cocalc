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
  const form = Form.useFormInstance();
  const watchedRegion = Form.useWatch("region", form);
  const watchedZone = Form.useWatch("zone", form);
  const watchedMachineType = Form.useWatch("machine_type", form);
  const watchedSize = Form.useWatch("size", form);
  const watchedGpuType = Form.useWatch("gpu_type", form);
  const gcpCompatibilityWarning = React.useMemo(() => {
    if (selectedProvider !== "gcp") return null;
    const gpuType =
      watchedGpuType && watchedGpuType !== "none" ? watchedGpuType : undefined;
    if (!gpuType) return null;
    const regionOption = (options.region ?? []).find(
      (opt) => opt.value === watchedRegion,
    );
    const regionMeta = (regionOption?.meta ?? {}) as {
      compatible?: boolean;
      compatibleZone?: string;
    };
    if (regionMeta.compatible === false) {
      const compatibleRegions = (options.region ?? []).filter((opt) => {
        const meta = opt.meta as { compatible?: boolean } | undefined;
        return meta?.compatible === true;
      });
      return { type: "region" as const, compatibleRegions };
    }
    if (!watchedZone) return null;
    const zoneOption = (options.zone ?? []).find(
      (opt) => opt.value === watchedZone,
    );
    const zoneMeta = (zoneOption?.meta ?? {}) as {
      compatible?: boolean;
      region?: string;
    };
    if (zoneMeta.compatible !== false) return null;
    const compatibleZones = (options.zone ?? []).filter((opt) => {
      const meta = opt.meta as { compatible?: boolean } | undefined;
      return meta?.compatible === true;
    });
    return { type: "zone" as const, compatibleZones };
  }, [
    options.region,
    options.zone,
    selectedProvider,
    watchedGpuType,
    watchedRegion,
    watchedZone,
  ]);
  const ensureFieldValue = React.useCallback(
    (field: "region" | "zone" | "machine_type" | "size" | "gpu_type", current?: string) => {
      const fieldOptions = options[field] ?? [];
      if (!fieldOptions.length) return;
      if (!current || !fieldOptions.some((opt) => opt.value === current)) {
        form.setFieldsValue({ [field]: fieldOptions[0]?.value });
      }
    },
    [form, options],
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
      {gcpCompatibilityWarning?.type === "region" && (
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
      {gcpCompatibilityWarning?.type === "zone" && (
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
