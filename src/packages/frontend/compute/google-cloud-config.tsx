import type { GoogleCloudConfiguration as GoogleCloudConfigurationType } from "@cocalc/util/db-schema/compute-servers";
import { Select, Spin, Table } from "antd";
import { plural } from "@cocalc/util/misc";
import computeCost, {
  GoogleCloudData,
} from "@cocalc/util/compute/cloud/google-cloud/compute-cost";
import { getGoogleCloudPriceData, setServerConfiguration } from "./api";
import { useEffect, useState } from "react";
import MoneyStatistic from "@cocalc/frontend/purchases/money-statistic";
import ShowError from "@cocalc/frontend/components/error";
import { isEqual } from "lodash";
import { currency } from "@cocalc/util/misc";

interface Props {
  configuration: GoogleCloudConfigurationType;
  editable?: boolean;
  id?: number;
}

export default function Configuration({
  configuration: configuration0,
  editable,
  id,
}: Props) {
  const [cost, setCost] = useState<number | null>(null);
  const [priceData, setPriceData] = useState<GoogleCloudData | null>(null);
  const [error, setError] = useState<string>("");
  const [configuration, setLocalConfiguration] =
    useState<GoogleCloudConfigurationType>(configuration0);

  useEffect(() => {
    setLocalConfiguration(configuration0);
  }, [configuration0]);

  useEffect(() => {
    if (!editable || !id) return;
    (async () => {
      try {
        const data = await getGoogleCloudPriceData();
        setPriceData(data);
      } catch (err) {
        setError(`${err}`);
      }
    })();
  }, []);

  useEffect(() => {
    if (!editable || !id || configuration == null || priceData == null) {
      return;
    }
    try {
      setError("");
      const cost = computeCost({ configuration, priceData });
      setCost(cost);
    } catch (err) {
      setError(`${err}`);
      setCost(null);
    }
  }, [configuration, priceData]);

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

  if (priceData == null) {
    return <Spin />;
  }

  const setConfig = async (changes) => {
    let changed = false;
    for (const key in changes) {
      if (!isEqual(changes[key], configuration[key])) {
        changed = true;
        break;
      }
    }
    if (!changed) return;
    try {
      await setServerConfiguration({ id, configuration: changes });
      setLocalConfiguration({ ...configuration, ...changes });
    } catch (err) {
      setError(`${err}`);
    }
  };

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
      value: (
        <Region
          priceData={priceData}
          setConfig={setConfig}
          configuration={configuration}
        />
      ),
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
      <ShowError error={error} setError={setError} />
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

// Filter `option.label` match the user type `input`
const filterOption = (
  input: string,
  option: { label: string; value: string },
) => (option?.label ?? "").toLowerCase().includes(input.toLowerCase());

function Region({ priceData, setConfig, configuration }) {
  const [newRegion, setNewRegion] = useState<string>(configuration.region);
  const [editing, setEditing] = useState<boolean>(false);
  useEffect(() => {
    setNewRegion(configuration.region);
  }, [configuration.region]);

  if (!editing) {
    return <span onClick={() => setEditing(true)}>{newRegion}</span>;
  }
  const regions = getRegions(priceData, configuration);
  const options = regions.map(({ region, location, lowCO2, cost }) => {
    const price = cost ? ` - ${currency(cost)}/hour` : "";
    return {
      value: region,
      label: `${region} (${location?.split(",")[1].trim()}) ${price} ${
        lowCO2 ? " - 🍃 Low CO2" : ""
      }`,
    };
  });

  return (
    <div>
      {configuration.machineType ? (
        <div style={{ color: "#888", marginBottom: "5px" }}>
          Select a region with {configuration.machineType}{" "}
          {configuration.spot ? "spot" : ""} instances
        </div>
      ) : undefined}
      <Select
        style={{ width: "350px" }}
        options={options}
        value={newRegion}
        onChange={setNewRegion}
        showSearch
        optionFilterProp="children"
        filterOption={filterOption}
        onBlur={() => {
          setConfig({ region: newRegion });
          setEditing(false);
        }}
      />
    </div>
  );
}

function getRegions(priceData, configuration) {
  const lowCO2 = new Set<string>();
  const regions = new Set<string>();
  const location: { [region: string]: string } = {};
  const cost: { [region: string]: number } = {};
  const { machineType, spot } = configuration ?? {};
  for (const zone in priceData.zones) {
    const i = zone.lastIndexOf("-");
    const region = zone.slice(0, i);
    const zoneData = priceData.zones[zone];
    if (machineType) {
      if (!zoneData.machineTypes.includes(machineType.split("-")[0])) {
        continue;
      }
      if (spot != null) {
        if (priceData.machineTypes[machineType]?.spot?.[region] == null) {
          continue;
        }
      }
    }
    if (cost[region] == null) {
      try {
        cost[region] = computeCost({
          priceData,
          configuration: { ...configuration, region, zone },
        });
      } catch (err) {
        console.warn({ ...configuration, region, zone }, err);
      }
    }
    if (zoneData.lowCO2 || zoneData.lowC02) {
      // C02 above because of typo in data.
      lowCO2.add(region);
    }
    regions.add(region);
    location[region] = zoneData.location;
  }
  const v = Array.from(regions);
  v.sort();
  const data: {
    region: string;
    location: string;
    lowCO2: boolean;
    cost?: number;
  }[] = [];
  for (const region of v) {
    data.push({
      region,
      location: location[region],
      lowCO2: lowCO2.has(region),
      cost: cost[region],
    });
  }
  return data;
}
