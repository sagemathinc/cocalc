import type { GoogleCloudConfiguration as GoogleCloudConfigurationType } from "@cocalc/util/db-schema/compute-servers";
import { Table } from "antd";
import { plural } from "@cocalc/util/misc";
import computeCost from "@cocalc/util/compute/cloud/google-cloud/compute-cost";
import { getGoogleCloudPricingData } from "./api";
import { useEffect, useState } from "react";
import MoneyStatistic from "@cocalc/frontend/purchases/money-statistic";

interface Props {
  configuration: GoogleCloudConfigurationType;
  editable?: boolean;
  id?: number;
}

export default function Configuration({ configuration, editable, id }: Props) {
  const [cost, setCost] = useState<number | null>(null);
  useEffect(() => {
    if (!configuration) return;
    (async () => {
      try {
        const priceData = await getGoogleCloudPricingData();
        setCost(computeCost({ configuration, priceData }));
      } catch (err) {
        console.log(err);
      }
    })();
  }, [configuration]);

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
    <div>
      {cost ? (
        <div style={{ float: "right" }}>
          <MoneyStatistic value={cost} title="Cost per hour" />
        </div>
      ) : null}
      <Table
        style={{ marginTop: "5px" }}
        rowKey="label"
        columns={columns}
        dataSource={data}
        pagination={false}
      />
    </div>
  );
}
