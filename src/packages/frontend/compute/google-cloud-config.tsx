import type { GoogleCloudConfiguration as GoogleCloudConfigurationType } from "@cocalc/util/db-schema/compute-servers";
import { Table } from "antd";
import { plural } from "@cocalc/util/misc";

interface Props {
  configuration: GoogleCloudConfigurationType;
  editable?: boolean;
  id?: number;
}

export default function Configuration({ configuration, editable, id }: Props) {
  if (!editable || !id) {
    const gpu = configuration.acceleratorType
      ? `, ${configuration.acceleratorCount ?? 1} ${
          configuration.acceleratorType
        } ${plural(configuration.acceleratorCount ?? 1, "GPU")}`
      : "";
    // short summary
    return (
      <div>
        {configuration.spot ? "Spot instance " : ""} {configuration.machineType}{" "}
        in {configuration.zone} with {configuration.diskSizeGb ?? "at least 10"}{" "}
        Gb boot disk{gpu}.
      </div>
    );
  }

  const columns = [
    { dataIndex: "label", key: "label" },
    {
      dataIndex: "value",
      key: "value",
    },
  ];

  const data = [
    {
      label: "Region",
      value: configuration.region,
    },
    {
      label: "Zone",
      value: configuration.zone,
    },
    {
      label: "Machine Type",
      value: configuration.machineType,
    },
    {
      label: "Provisioning",
      value: configuration.spot ? "Spot" : "Standard",
    },
    {
      label: "Boot Disk Size",
      value: `${configuration.diskSizeGb ?? "at least 10"} Gb`,
    },
    {
      label: "GPU",
      value: `${configuration.acceleratorCount ?? ""} ${
        configuration.acceleratorType ?? "none"
      }`,
    },
  ];
  return (
    <Table
      style={{ marginTop:'5px' }}
      rowKey="label"
      columns={columns}
      dataSource={data}
      pagination={false}
    />
  );
}
