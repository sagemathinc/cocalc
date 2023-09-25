import type { GoogleCloudConfiguration as GoogleCloudConfigurationType } from "@cocalc/util/db-schema/compute-servers";
import {
  Card,
  Checkbox,
  InputNumber,
  Radio,
  Select,
  Spin,
  Switch,
  Table,
} from "antd";
import { cmp, plural } from "@cocalc/util/misc";
import computeCost, {
  GoogleCloudData,
} from "@cocalc/util/compute/cloud/google-cloud/compute-cost";
import { getGoogleCloudPriceData, setServerConfiguration } from "./api";
import { useEffect, useState } from "react";
import MoneyStatistic from "@cocalc/frontend/purchases/money-statistic";
import { A } from "@cocalc/frontend/components/A";
import { Icon } from "@cocalc/frontend/components/icon";
import { isEqual } from "lodash";
import { currency } from "@cocalc/util/misc";

const SELECTOR_WIDTH = "300px";

// TODO: this needs to depend on how big actual image is, if we use a read only disk etc.  For now this will work.
const MIN_DISK_SIZE_GB = 25;

interface ConfigurationType extends GoogleCloudConfigurationType {
  valid?: boolean;
}

interface Props {
  configuration: ConfigurationType;
  editable?: boolean;
  // if id not set, then doesn't try to save anything to the backend
  id?: number;
  // called whenever changes are made.
  onChange?: (configuration: ConfigurationType) => void;
  disabled?: boolean;
}

export default function Configuration({
  configuration: configuration0,
  editable,
  id,
  onChange,
  disabled,
}: Props) {
  const [loading, setLoading] = useState<boolean>(false);
  const [cost, setCost] = useState<number | null>(null);
  const [priceData, setPriceData] = useState<GoogleCloudData | null>(null);
  const [error, setError0] = useState<string>("");
  const [configuration, setLocalConfiguration] =
    useState<ConfigurationType>(configuration0);
  const setError = (error) => {
    setError0(error);
    const valid = !error;
    if (onChange != null && configuration.valid != valid) {
      onChange({ ...configuration, valid });
    }
  };

  useEffect(() => {
    setLocalConfiguration(configuration0);
  }, [configuration0]);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const data = await getGoogleCloudPriceData();
        //window.x = { data, TESTING: (data.markup = 0) };
        setPriceData(data);
      } catch (err) {
        setError(`${err}`);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!editable || configuration == null || priceData == null) {
      return;
    }
    try {
      const cost = computeCost({ configuration, priceData });
      setError("");
      setCost(cost);
    } catch (err) {
      setError(`${err}`);
      setCost(null);
    }
  }, [configuration, priceData]);

  if (!editable) {
    const gpu = configuration.acceleratorType
      ? `${configuration.acceleratorCount ?? 1} ${displayAcceleratorType(
          configuration.acceleratorType,
        )} ${plural(configuration.acceleratorCount ?? 1, "GPU", "GPU's")}, `
      : "";
    // short summary
    return (
      <div>
        {configuration.spot ? "Spot " : "Standard "}VM with {gpu}
        {priceData ? (
          <span>
            <RamAndCpu
              machineType={configuration.machineType}
              priceData={priceData}
              inline
            />
          </span>
        ) : (
          ""
        )}
        , and a {configuration.diskSizeGb ?? `at least ${MIN_DISK_SIZE_GB}`} GB
        boot disk.
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
    if (!changed) {
      // nothing at all changed
      return;
    }

    changes = {
      ...changes,
      ...ensureConsistentConfiguration(priceData, configuration, changes),
    };

    if (Object.keys(changes).length == 0) {
      // nothing going to change
      return;
    }

    try {
      setLoading(true);
      if (onChange != null) {
        onChange({ ...configuration, ...changes });
      }
      setLocalConfiguration({ ...configuration, ...changes });
      if (id != null) {
        await setServerConfiguration({ id, configuration: changes });
      }
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
      key: "machineType",
      label: (
        <A href="https://cloud.google.com/compute/docs/machine-resource">
          <Icon name="external-link" /> VM Types
        </A>
      ),
      value: (
        <MachineType
          disabled={loading || disabled}
          priceData={priceData}
          setConfig={setConfig}
          configuration={configuration}
        />
      ),
    },
    {
      key: "region",
      label: (
        <A href="https://cloud.google.com/about/locations">
          <Icon name="external-link" /> Regions
        </A>
      ),
      value: (
        <Region
          disabled={loading || disabled}
          priceData={priceData}
          setConfig={setConfig}
          configuration={configuration}
        />
      ),
    },
    {
      key: "zone",
      label: (
        <A href="https://cloud.google.com/about/locations">
          <Icon name="external-link" /> Zones
        </A>
      ),
      value: (
        <Zone
          disabled={loading || disabled}
          priceData={priceData}
          setConfig={setConfig}
          configuration={configuration}
        />
      ),
    },

    {
      key: "provisioning",
      label: (
        <A href="https://cloud.google.com/compute/docs/instances/spot">
          <Icon name="external-link" /> Provisioning
        </A>
      ),
      value: (
        <Provisioning
          disabled={loading || disabled}
          priceData={priceData}
          setConfig={setConfig}
          configuration={configuration}
        />
      ),
    },
    {
      key: "gpu",
      label: (
        <A href="https://cloud.google.com/compute/docs/gpus">
          <Icon name="external-link" /> GPUs
        </A>
      ),
      value: (
        <GPU
          disabled={loading || disabled}
          priceData={priceData}
          setConfig={setConfig}
          configuration={configuration}
        />
      ),
    },

    {
      key: "boot",
      label: (
        <A href="https://cloud.google.com/compute/docs/disks">
          <Icon name="external-link" /> Boot Disk
        </A>
      ),
      value: (
        <BootDisk
          disabled={loading || disabled}
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
      <div
        style={{
          minHeight: "35px",
          padding: "5px 10px",
          background: error ? "red" : undefined,
          color: "white",
          borderRadius: "5px",
        }}
      >
        {error}
      </div>
      {cost ? (
        <div style={{ textAlign: "center" }}>
          <MoneyStatistic value={cost} title="Cost per hour" />
        </div>
      ) : null}
      <Table
        style={{ marginTop: "5px" }}
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
        <div key={region}>
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
          <b>Region</b>
        </div>
      ) : undefined}
      <Select
        disabled={disabled}
        style={{ width: SELECTOR_WIDTH, marginRight: "15px" }}
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
        disabled={disabled}
        style={{ marginTop: "5px" }}
        checked={sortByPrice}
        onChange={() => setSortByPrice(!sortByPrice)}
      >
        Sort by price
      </Checkbox>
    </div>
  );
}

// Gets the regions where the given VM type is available.
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
      } catch (_) {
        continue;
        // console.warn({ ...configuration, region, zone }, err);
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

// Gets the zones compatible with the other configuration
function getZones(priceData, configuration) {
  const lowCO2 = new Set<string>();
  const zones = new Set<string>();
  const { region, machineType, acceleratorType, spot } = configuration;
  const prefix = machineType.split("-")[0];
  for (const zone in priceData.zones) {
    if (region != zoneToRegion(zone)) {
      // this zone isn't in the chosen region.
      continue;
    }
    const zoneData = priceData.zones[zone];
    if (machineType) {
      if (!zoneData.machineTypes.includes(prefix)) {
        continue;
      }
      if (spot != null) {
        if (priceData.machineTypes[machineType]?.spot?.[region] == null) {
          continue;
        }
      }
    }
    if (acceleratorType) {
      if (priceData.accelerators[acceleratorType]?.prices?.[zone] == null) {
        // not in this zone.
        continue;
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
    discount: number;
  } | null>(getSpotAndStandardPrices(priceData, configuration));

  useEffect(() => {
    setNewSpot(!!configuration.spot);
    setPrices(getSpotAndStandardPrices(priceData, configuration));
  }, [configuration]);

  return (
    <div>
      <div style={{ color: "#666", marginBottom: "5px" }}>
        <b>Provisioning</b>
      </div>
      <Radio.Group
        buttonStyle="solid"
        disabled={disabled}
        value={newSpot ? "spot" : "standard"}
        onChange={(e) => {
          const spot = e.target.value == "standard" ? false : true;
          setNewSpot(spot);
          setConfig({ spot });
        }}
      >
        <Radio.Button value="spot">
          Spot{" "}
          {prices != null
            ? `${currency(prices.spot)}/hour (${prices.discount}% discount)`
            : undefined}{" "}
        </Radio.Button>
        <Radio.Button value="standard">
          Standard{" "}
          {prices != null ? `${currency(prices.standard)}/hour` : undefined}{" "}
        </Radio.Button>
      </Radio.Group>
      <div style={{ color: "#666", marginTop: "5px" }}>
        Standard VMs stay running until you stop them, but cost more. Spot VMs
        stop when there is a surge in demand, and the price changes over time,
        location, and VM type.
      </div>
    </div>
  );
}

function getSpotAndStandardPrices(priceData, configuration) {
  try {
    const standard = computeCost({
      priceData,
      configuration: { ...configuration, spot: false },
    });
    const spot = computeCost({
      priceData,
      configuration: { ...configuration, spot: true },
    });
    return {
      standard,
      spot,
      discount: Math.round((1 - spot / standard) * 100),
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
          <b>Zone</b> in {configuration.region} with {configuration.machineType}{" "}
          {configuration.spot ? "spot" : ""} VMs
        </div>
      ) : undefined}
      <Select
        disabled={disabled}
        style={{ width: SELECTOR_WIDTH }}
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
  const [sortByPrice, setSortByPrice] = useState<boolean>(true);
  const [newMachineType, setNewMachineType] = useState<string>(
    configuration.machineType ?? "",
  );
  useEffect(() => {
    setNewMachineType(configuration.machineType);
  }, [configuration]);

  const machineTypes = Object.keys(priceData.machineTypes);
  let allOptions = machineTypes.map((machineType) => {
    let cost;
    try {
      cost = computeCost({
        priceData,
        configuration: { ...configuration, machineType },
      });
    } catch (_) {
      cost = null;
    }
    return {
      value: machineType,
      search: machineType,
      cost,
      label: (
        <div key={machineType}>
          {machineType}{" "}
          {cost ? (
            `- ${currency(cost)}/hour`
          ) : (
            <span style={{ color: "#666" }}>(config will change)</span>
          )}
          <RamAndCpu machineType={machineType} priceData={priceData} />
        </div>
      ),
    };
  });
  const options = [
    {
      label: "Machine Types",
      options: allOptions.filter((x) => x.cost),
    },
    {
      label: "Other Configuration Will Change",
      options: allOptions.filter((x) => !x.cost),
    },
  ];

  if (sortByPrice) {
    options[0].options.sort((a, b) => {
      return cmp(a.cost, b.cost);
    });
  }

  return (
    <div>
      <div style={{ color: "#666", marginBottom: "5px" }}>
        <b>Machine Type</b>
      </div>
      <Select
        disabled={disabled}
        style={{ width: SELECTOR_WIDTH }}
        options={options as any}
        value={newMachineType}
        onChange={(machineType) => {
          setNewMachineType(machineType);
          setConfig({ machineType });
        }}
        showSearch
        optionFilterProp="children"
        filterOption={filterOption}
      />
      <Checkbox
        disabled={disabled}
        style={{ marginTop: "5px", marginLeft: "15px" }}
        checked={sortByPrice}
        onChange={() => setSortByPrice(!sortByPrice)}
      >
        Sort by price
      </Checkbox>
      <div style={{ textAlign: "center" }}>
        <Card type="inner" style={{ margin: "5px auto", fontSize: "13pt" }}>
          <RamAndCpu
            machineType={newMachineType}
            priceData={priceData}
            style={{ marginTop: "5px" }}
          />
        </Card>
      </div>
      <div style={{ color: "#666", marginTop: "5px" }}>
        Prices and availability depend on the region and provisioning type, so
        adjust those below to find the best overall value.
      </div>
    </div>
  );
}

function RamAndCpu({
  machineType,
  priceData,
  style,
  inline,
}: {
  machineType: string;
  priceData;
  style?;
  inline?: boolean;
}) {
  const data = priceData.machineTypes[machineType];
  if (data == null) return null;
  const { memory } = data;
  let { vcpu } = data;
  if (!vcpu || !memory) return null;
  if (machineType == "e2-micro") {
    vcpu = "0.25-2";
  } else if (machineType == "e2-small") {
    vcpu = "0.5-2";
  } else if (machineType == "e2-medium") {
    vcpu = "1-2";
  }
  if (inline) {
    return (
      <span style={style}>
        {vcpu} {plural(vcpu, "vCPU", "vCPU's")}, {memory} GB RAM
      </span>
    );
  }
  return (
    <div style={{ color: "#666", ...style }}>
      <b>{plural(vcpu, "vCPU", "vCPU's")}: </b>
      <div
        style={{ width: "65px", textAlign: "left", display: "inline-block" }}
      >
        {vcpu}
      </div>
      <b>Memory:</b> {memory} GB
    </div>
  );
}

function BootDisk({ setConfig, configuration, disabled }) {
  const [newDiskSizeGb, setNewDiskSizeGb] = useState<number | null>(
    configuration.diskSizeGb ?? MIN_DISK_SIZE_GB,
  );
  useEffect(() => {
    setNewDiskSizeGb(configuration.diskSizeGb ?? MIN_DISK_SIZE_GB);
  }, [configuration.diskSizeGb]);

  return (
    <div>
      <div style={{ color: "#666", marginBottom: "5px" }}>
        <b>Boot Disk</b>
      </div>
      <InputNumber
        style={{ width: SELECTOR_WIDTH }}
        disabled={disabled}
        min={MIN_DISK_SIZE_GB}
        max={10000}
        value={newDiskSizeGb}
        addonAfter="GB"
        onChange={(diskSizeGb) => {
          setNewDiskSizeGb(diskSizeGb);
        }}
        onBlur={() => {
          // only set on blur or every keystroke rerenders and cause loss of focus.
          setConfig({ diskSizeGb: newDiskSizeGb ?? MIN_DISK_SIZE_GB });
        }}
      />
      <div style={{ color: "#666", marginTop: "5px" }}>
        Set the size of the compute server's boot disk.
      </div>
    </div>
  );
}

function GPU({ priceData, setConfig, configuration, disabled }) {
  const { acceleratorType, acceleratorCount } = configuration;
  const head = (
    <div style={{ color: "#666", marginBottom: "5px" }}>
      <b>NVIDIA T4, P4, V100, P100, or A100 GPU</b>
    </div>
  );

  const theSwitch = (
    <Switch
      disabled={disabled}
      checkedChildren={"NVIDIA GPU"}
      unCheckedChildren={"NO GPU"}
      checked={!!acceleratorType}
      onChange={() => {
        if (!!acceleratorType) {
          setConfig({ acceleratorType: "", acceleratorCount: 0 });
        } else {
          setConfig({
            acceleratorType: "nvidia-t4",
            acceleratorCount: 1,
          });
        }
      }}
    />
  );
  if (!acceleratorType) {
    return (
      <div>
        {head}
        {theSwitch}
      </div>
    );
  }

  const acceleratorTypes = Object.keys(priceData.accelerators);
  const options = acceleratorTypes.map((acceleratorType) => {
    let cost;
    try {
      cost = computeCost({
        priceData,
        configuration: { ...configuration, acceleratorType, acceleratorCount },
      });
    } catch (_) {
      cost = null;
    }
    const price = cost ? (
      ` - ${currency(cost)}/hour`
    ) : (
      <span style={{ color: "#666" }}>(config will change)</span>
    );
    const memory = priceData.accelerators[acceleratorType].memory;
    return {
      value: acceleratorType,
      search: acceleratorType,
      cost,
      label: (
        <div key={acceleratorType}>
          {displayAcceleratorType(acceleratorType, memory)} {price}
        </div>
      ),
    };
  });

  return (
    <div>
      {head}
      {theSwitch}
      <div style={{ marginTop: "15px" }}>
        <Select
          disabled={disabled}
          style={{ width: SELECTOR_WIDTH }}
          options={options as any}
          value={acceleratorType}
          onChange={(type) => {
            setConfig({ acceleratorType: type });
            // todo -- change count if necessary
          }}
          showSearch
          optionFilterProp="children"
          filterOption={filterOption}
        />
        <InputNumber
          addonAfter="Count"
          style={{ marginLeft: "15px", width: "125px" }}
          disabled={disabled}
          min={1}
          max={priceData.accelerators[acceleratorType].max}
          value={acceleratorCount}
          onChange={(count) => {
            setConfig({ acceleratorCount: count });
          }}
        />
      </div>
      {acceleratorType?.includes("a100") && configuration.spot ? (
        <div style={{ marginTop: "5px", color: "#666" }}>
          <b>WARNING:</b> A100 spot instances are rarely available. Consider
          standard provisioning instead.
        </div>
      ) : undefined}
    </div>
  );
}

function displayAcceleratorType(acceleratorType, memory?) {
  let x = acceleratorType
    .replace("nvidia-", "NVIDIA ")
    .replace("-", " - ")
    .toUpperCase();
  if (x.includes("GB") || !memory) {
    return x;
  }
  return `${x} - ${memory} GB`;
}

function ensureConsistentConfiguration(
  priceData,
  configuration: GoogleCloudConfigurationType,
  changes: Partial<GoogleCloudConfigurationType>,
) {
  const newConfiguration = { ...configuration, ...changes };
  const newChanges = { ...changes };

  ensureConsistentAccelerator(priceData, newConfiguration, newChanges);

  ensureConsistentRegionAndZoneWithMachineType(
    priceData,
    newConfiguration,
    newChanges,
  );

  ensureConsistentZoneWithRegion(priceData, newConfiguration, newChanges);

  return newChanges;
}

function ensureConsistentZoneWithRegion(priceData, configuration, changes) {
  if (configuration.zone.startsWith(configuration.region)) {
    return;
  }
  if (changes["region"]) {
    // currently changing region, so set a zone that matches the region
    for (const zone in priceData.zones) {
      if (zone.startsWith(configuration.region)) {
        changes["zone"] = zone;
        break;
      }
    }
  } else {
    // probably changing the zone, so set the region from the zone
    changes["region"] = zoneToRegion(configuration.zone);
  }
}

function ensureConsistentAccelerator(priceData, configuration, changes) {
  if (!configuration.acceleratorType) {
    return;
  }
  // have a GPU
  const data = priceData.accelerators[configuration.acceleratorType];
  // Ensure the machine type is consistent
  if (!configuration.machineType.startsWith(data.machineType)) {
    if (changes["machineType"]) {
      // if you are explicitly changing the machine type, then we respect
      // that and disabled the gpu
      configuration["acceleratorType"] = changes["acceleratorType"] = "";
      configuration["acceleratorCount"] = changes["acceleratorCount"] = 0;
      return;
    } else {
      // changing something else, so we fix the machine type
      for (const type in priceData.machineTypes) {
        if (type.startsWith(data.machineType)) {
          configuration["machineType"] = changes["machineType"] = type;
          break;
        }
      }
    }
  }
  // Ensure the count is consistent
  const count = configuration.acceleratorCount ?? 0;
  if (count < 1) {
    changes["acceleratorCount"] = 1;
  } else if (count > data.max) {
    changes["acceleratorCount"] = data.max;
  }
}

function ensureConsistentRegionAndZoneWithMachineType(
  priceData,
  configuration,
  changes,
) {
  // Specifically selecting a machine type.  We make this the
  // highest priority, so if you are changing this, we make everything
  // else fit it.
  const machineType = configuration["machineType"];
  if (priceData.machineTypes[machineType] == null) {
    console.warn(
      `BUG -- This should never happen: unknonwn machineType = '${machineType}'`,
    );
    // invalid machineType -- so just fix it to the most compatible
    configuration["machineType"] = changes["machineType"] = "n1-standard-1";
    return;
  }

  const i = machineType.indexOf("-");
  const prefix = machineType.slice(0, i);

  let zoneHasMachineType = (
    priceData.zones[configuration.zone]?.machineTypes ?? []
  ).includes(prefix);
  const regionToCost =
    priceData.machineTypes[machineType][
      configuration.spot ? "spot" : "prices"
    ] ?? {};
  const regionHasMachineType = regionToCost[configuration.region] != null;

  if (!regionHasMachineType) {
    // Our machine type is not in the currently selected region,
    // so find cheapest region with our requested machine type.
    let price = 1e8;
    for (const region in regionToCost) {
      if (regionToCost[region] < price) {
        price = regionToCost[region];
        configuration["region"] = changes["region"] = region;
        // since we changed the region:
        zoneHasMachineType = false;
      }
    }
  }
  if (!zoneHasMachineType) {
    // now the region has the machine type, but the zone doesn't (or
    // region changed so zone has to change).
    // So we find some zone with the machine in that region
    for (const zone in priceData.zones) {
      if (zone.startsWith(configuration["region"])) {
        if ((priceData.zones[zone]?.machineTypes ?? []).includes(prefix)) {
          configuration["zone"] = changes["zone"] = zone;
          break;
        }
      }
    }
  }
}

function zoneToRegion(zone: string): string {
  const i = zone.lastIndexOf("-");
  return zone.slice(0, i);
}
