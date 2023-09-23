import type { GoogleCloudConfiguration as GoogleCloudConfigurationType } from "@cocalc/util/db-schema/compute-servers";
import { Checkbox, Radio, Select, Spin, Table } from "antd";
import { cmp, plural } from "@cocalc/util/misc";
import computeCost, {
  GoogleCloudData,
} from "@cocalc/util/compute/cloud/google-cloud/compute-cost";
import { getGoogleCloudPriceData, setServerConfiguration } from "./api";
import { useEffect, useState } from "react";
import MoneyStatistic from "@cocalc/frontend/purchases/money-statistic";
import ShowError from "@cocalc/frontend/components/error";
import { A } from "@cocalc/frontend/components/A";
import { Icon } from "@cocalc/frontend/components/icon";
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
  const [loading, setLoading] = useState<boolean>(false);
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
        setLoading(true);
        const data = await getGoogleCloudPriceData();
        window.data = data;
        setPriceData(data);
      } catch (err) {
        setError(`${err}`);
      } finally {
        setLoading(false);
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
      setLoading(true);
      await setServerConfiguration({ id, configuration: changes });
      setLocalConfiguration({ ...configuration, ...changes });
    } catch (err) {
      setError(`${err}`);
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    {
      dataIndex: "value",
      key: "value",
    },
    { dataIndex: "label", key: "label", width: 130 },
  ];

  const data = [
    {
      label: (
        <A href="https://cloud.google.com/compute/docs/machine-resource">
          <Icon name="external-link" /> Machine Type
        </A>
      ),
      value: (
        <MachineType
          disabled={loading}
          priceData={priceData}
          setConfig={setConfig}
          configuration={configuration}
        />
      ),
    },
    {
      label: (
        <A href="https://cloud.google.com/compute/docs/instances/spot">
          <Icon name="external-link" /> Provisioning
        </A>
      ),
      value: (
        <Provisioning
          disabled={loading}
          priceData={priceData}
          setConfig={setConfig}
          configuration={configuration}
        />
      ),
    },
    {
      label: (
        <A href="https://cloud.google.com/compute/docs/gpus">
          <Icon name="external-link" /> GPU
        </A>
      ),
      value: (
        <GPU
          disabled={loading}
          priceData={priceData}
          setConfig={setConfig}
          configuration={configuration}
        />
      ),
    },
    {
      label: (
        <A href="https://cloud.google.com/about/locations">
          <Icon name="external-link" /> Region
        </A>
      ),
      value: (
        <Region
          disabled={loading}
          priceData={priceData}
          setConfig={setConfig}
          configuration={configuration}
        />
      ),
    },
    {
      label: (
        <A href="https://cloud.google.com/about/locations">
          <Icon name="external-link" /> Zone
        </A>
      ),
      value: (
        <Zone
          disabled={loading}
          priceData={priceData}
          setConfig={setConfig}
          configuration={configuration}
        />
      ),
    },
    {
      label: (
        <A href="https://cloud.google.com/compute/docs/disks">
          <Icon name="external-link" /> Boot Disk
        </A>
      ),
      value: (
        <BootDisk
          disabled={loading}
          priceData={priceData}
          setConfig={setConfig}
          configuration={configuration}
        />
      ),
    },
  ];
  return (
    <div>
      {loading && (
        <div style={{ float: "right" }}>
          <Spin delay={1000} />
        </div>
      )}
      {cost ? (
        <div style={{ textAlign: "center" }}>
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
  option: { label: string; value: string; search: string },
) => (option?.search ?? "").toLowerCase().includes(input.toLowerCase());

function Region({ priceData, setConfig, configuration, disabled }) {
  const [sortByPrice, setSortByPrice] = useState<boolean>(true);
  const [newRegion, setNewRegion] = useState<string>(configuration.region);
  useEffect(() => {
    setNewRegion(configuration.region);
  }, [configuration.region]);

  const regions = getRegions(priceData, configuration);
  if (sortByPrice) {
    regions.sort((a, b) => cmp(a.cost, b.cost));
  }
  const options = regions.map(({ region, location, lowCO2, cost }) => {
    const price = cost ? ` - ${currency(cost)}/hour` : "";
    return {
      value: region,
      search: `${region} ${location} ${lowCO2 ? " co2 " : ""}`,
      label: (
        <div>
          {region} {price}
          <br />
          {location?.split(",")[1].trim()}
          {lowCO2 ? " - 🍃 Low CO2" : ""}
        </div>
      ),
    };
  });

  return (
    <div>
      {configuration.machineType ? (
        <div style={{ color: "#666", marginBottom: "5px" }}>
          Select from regions with {configuration.machineType}{" "}
          {configuration.spot ? "spot" : ""} instances.
        </div>
      ) : undefined}
      <Select
        disabled={disabled}
        style={{ width: "350px", marginRight: "5px" }}
        options={options as any}
        value={newRegion}
        onChange={(region) => {
          setNewRegion(region);
          setConfig({ region });
        }}
        showSearch
        optionFilterProp="children"
        filterOption={filterOption}
      />
      <Checkbox
        style={{ marginTop: "5px" }}
        checked={sortByPrice}
        onChange={() => setSortByPrice(!sortByPrice)}
      >
        Sort by price
      </Checkbox>
    </div>
  );
}

// Gets the regions where the given instance type is available.
// Ignores the currently selected zone.
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
  v.sort((a, b) => {
    for (const g of [
      "us",
      "northamerica",
      "europe",
      "asia",
      "southamerica",
      "australia",
    ]) {
      if (a.startsWith(g) && !b.startsWith(g)) {
        return -1;
      }
      if (!a.startsWith(g) && b.startsWith(g)) {
        return 1;
      }
    }
    return cmp(a, b);
  });
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

// Gets the zones in a region where the instance type is available.
function getZones(priceData, configuration) {
  const lowCO2 = new Set<string>();
  const zones = new Set<string>();
  const { region, machineType, spot } = configuration ?? {};
  if (!region) {
    return [];
  }
  for (const zone in priceData.zones) {
    const i = zone.lastIndexOf("-");
    if (region != zone.slice(0, i)) {
      // this zone isn't in the chosen region.
      continue;
    }
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
    if (zoneData.lowCO2 || zoneData.lowC02) {
      // C02 above because of typo in data.
      lowCO2.add(zone);
    }
    zones.add(zone);
  }
  const v = Array.from(zones);
  v.sort();
  const data: {
    zone: string;
    lowCO2: boolean;
  }[] = [];
  for (const zone of v) {
    data.push({
      zone,
      lowCO2: lowCO2.has(zone),
    });
  }
  return data;
}

function Provisioning({ priceData, setConfig, configuration, disabled }) {
  const [newSpot, setNewSpot] = useState<boolean>(!!configuration.spot);
  const [prices, setPrices] = useState<{
    spot: number;
    standard: number;
  } | null>(getSpotAndStandardPrices(priceData, configuration));

  useEffect(() => {
    setNewSpot(!!configuration.spot);
    setPrices(getSpotAndStandardPrices(priceData, configuration));
  }, [configuration]);

  return (
    <div>
      <Radio.Group
        disabled={disabled}
        value={newSpot ? "spot" : "standard"}
        onChange={(e) => {
          const spot = e.target.value == "standard" ? false : true;
          setNewSpot(spot);
          setConfig({ spot });
        }}
        buttonStyle="solid"
      >
        <Radio.Button value="standard">
          Standard{" "}
          {prices != null ? `${currency(prices.standard)}/hour` : undefined}{" "}
        </Radio.Button>
        <Radio.Button value="spot">
          Spot {prices != null ? `${currency(prices.spot)}/hour` : undefined}{" "}
        </Radio.Button>
      </Radio.Group>
      <div style={{ color: "#666", marginTop: "5px" }}>
        Standard instances stay running until you stop them, but cost more. Spot
        instances stop when there is a surge in demand.
      </div>
    </div>
  );
}

function getSpotAndStandardPrices(priceData, configuration) {
  try {
    return {
      standard: computeCost({
        priceData,
        configuration: { ...configuration, spot: false },
      }),
      spot: computeCost({
        priceData,
        configuration: { ...configuration, spot: true },
      }),
    };
  } catch (_) {
    return null;
  }
}

function Zone({ priceData, setConfig, configuration, disabled }) {
  const [newZone, setNewZone] = useState<string>(configuration.zone ?? "");
  useEffect(() => {
    setNewZone(configuration.zone);
  }, [configuration.zone]);

  const zones = getZones(priceData, configuration);
  const options = zones.map(({ zone, lowCO2 }) => {
    return {
      value: zone,
      search: `${zone} ${lowCO2 ? " co 2" : ""}`,
      label: `${zone} ${lowCO2 ? " - 🍃 Low CO2" : ""}`,
    };
  });

  return (
    <div>
      {configuration.machineType ? (
        <div style={{ color: "#666", marginBottom: "5px" }}>
          Select from the zones in the region with {configuration.machineType}{" "}
          {configuration.spot ? "spot" : ""} instances
        </div>
      ) : undefined}
      <Select
        disabled={disabled}
        style={{ width: "300px" }}
        options={options}
        value={newZone}
        onChange={(zone) => {
          setNewZone(zone);
          setConfig({ zone });
        }}
        showSearch
        optionFilterProp="children"
        filterOption={filterOption}
      />
    </div>
  );
}

function MachineType({ priceData, setConfig, configuration, disabled }) {
  return <div>{configuration.machineType}</div>;
}

function BootDisk({ priceData, setConfig, configuration, disabled }) {
  return <div>{configuration.diskSizeGb ?? "at least 10"} Gb</div>;
}

function GPU({ priceData, setConfig, configuration, disabled }) {
  return (
    <div>
      {configuration.acceleratorCount ?? ""}{" "}
      {configuration.acceleratorType ?? "none"}
    </div>
  );
}
