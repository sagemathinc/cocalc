import type {
  State,
  GoogleCloudConfiguration as GoogleCloudConfigurationType,
} from "@cocalc/util/db-schema/compute-servers";
import { getMinDiskSizeGb } from "@cocalc/util/db-schema/compute-servers";
import {
  Button,
  Checkbox,
  Input,
  InputNumber,
  Radio,
  Select,
  Spin,
  Switch,
  Table,
  Typography,
} from "antd";
import { cmp, plural } from "@cocalc/util/misc";
import computeCost, {
  GoogleCloudData,
  EXTERNAL_IP_COST,
  EGRESS_COST_PER_GiB,
} from "@cocalc/util/compute/cloud/google-cloud/compute-cost";
import { getGoogleCloudPriceData, setServerConfiguration } from "./api";
import { useEffect, useState } from "react";
import MoneyStatistic from "@cocalc/frontend/purchases/money-statistic";
import { A } from "@cocalc/frontend/components/A";
import { Icon } from "@cocalc/frontend/components/icon";
import { isEqual } from "lodash";
import { currency } from "@cocalc/util/misc";
import { useTypedRedux } from "@cocalc/frontend/app-framework";
import { DNS_COST_PER_HOUR, checkValidDomain } from "@cocalc/util/compute/dns";

const SELECTOR_WIDTH = "350px";

const DEFAULT_GPU = "nvidia-tesla-t4";
const FALLBACK_INSTANCE = "n1-standard-1";

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
  state?: State;
}

export default function Configuration({
  configuration: configuration0,
  editable,
  id,
  onChange,
  disabled,
  state,
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
    if (!editable) {
      setLocalConfiguration(configuration0);
    }
  }, [configuration0]);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const data = await getGoogleCloudPriceData();
        // window.x = { data, TESTING: (data.markup = 0) };
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
        {configuration.spot ? "Spot " : "Standard "} {configuration.machineType}{" "}
        with {gpu}
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
        , and a{" "}
        {configuration.diskSizeGb ??
          `at least ${getMinDiskSizeGb(configuration)}`}{" "}
        GB
        {(configuration.diskType ?? "pd-standard") != "pd-standard"
          ? " SSD "
          : " HDD "}{" "}
        disk in {configuration.zone}.
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

    changes = ensureConsistentConfiguration(priceData, configuration, changes);
    const newConfiguration = { ...configuration, ...changes };

    if (
      (state ?? "deprovisioned") != "deprovisioned" &&
      (configuration.region != newConfiguration.region ||
        configuration.zone != newConfiguration.zone)
    ) {
      setError(
        "Can't change the region or zone without first deprovisioning the VM",
      );
      // make copy so config gets reset -- i.e., whatever change you just tried to make is reverted.
      setLocalConfiguration({ ...configuration });
      return;
    }

    if (Object.keys(changes).length == 0) {
      // nothing going to change
      return;
    }

    try {
      setLoading(true);
      if (onChange != null) {
        onChange(newConfiguration);
      }
      setLocalConfiguration(newConfiguration);
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
      key: "machineType",
      label: (
        <A href="https://cloud.google.com/compute/docs/machine-resource#recommendations_for_machine_types">
          <Icon name="external-link" /> Machine Types
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
          disabled={
            loading || disabled || (state ?? "deprovisioned") != "deprovisioned"
          }
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
          disabled={
            loading || disabled || (state ?? "deprovisioned") != "deprovisioned"
          }
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
      key: "disk",
      label: (
        <A href="https://cloud.google.com/compute/docs/disks/performance">
          <Icon name="external-link" /> Disks
        </A>
      ),
      value: (
        <BootDisk
          disabled={loading || disabled}
          setConfig={setConfig}
          configuration={configuration}
          priceData={priceData}
          state={state}
        />
      ),
    },

    {
      key: "network",
      label: <></>,
      value: (
        <Network
          disabled={loading || disabled}
          setConfig={setConfig}
          configuration={configuration}
          state={state}
          loading={loading}
        />
      ),
    },
  ];

  const errDisplay = error ? (
    <div
      style={{
        /*minHeight: "35px", */
        padding: "5px 10px",
        background: error ? "red" : undefined,
        color: "white",
        borderRadius: "5px",
      }}
    >
      {error}
      <Button
        size="small"
        onClick={() => {
          setError("");
          setLocalConfiguration(configuration0);
        }}
        style={{ float: "right" }}
      >
        Close
      </Button>
    </div>
  ) : undefined;

  return (
    <div>
      {loading && (
        <div style={{ float: "right" }}>
          <Spin delay={1000} />
        </div>
      )}
      {errDisplay}
      {cost ? (
        <div style={{ textAlign: "center" }}>
          <MoneyStatistic value={cost} title="Cost per hour" />
          <div style={{ color: "#666", maxWidth: "600px", margin: "auto" }}>
            Pay above rate by the millisecond while the computer server VM is
            running. Rate is <b>much cheaper</b> when VM is suspended or off,
            and there is no cost when it is deprovisioned.
          </div>
        </div>
      ) : null}
      <Table
        style={{ marginTop: "5px" }}
        columns={columns}
        dataSource={data}
        pagination={false}
      />
      {loading && (
        <div style={{ float: "right" }}>
          <Spin delay={1000} />
        </div>
      )}
      {errDisplay}
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
        Standard VM's stay running until you stop them, whereas spot VM's may
        get killed if there is a surge in demand.
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
            <span style={{ color: "#666" }}>(region/zone will change)</span>
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
      label: "Location Will Change",
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
        <b>Machine Type</b>{" "}
        <RamAndCpu
          machineType={newMachineType}
          priceData={priceData}
          style={{ float: "right" }}
        />
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

function BootDisk({ setConfig, configuration, disabled, priceData, state }) {
  const [newDiskSizeGb, setNewDiskSizeGb] = useState<number | null>(
    configuration.diskSizeGb ?? getMinDiskSizeGb(configuration),
  );
  const [newDiskType, setNewDiskType] = useState<number | null>(
    configuration.diskType ?? "pd-standard",
  );
  useEffect(() => {
    setNewDiskSizeGb(
      configuration.diskSizeGb ?? getMinDiskSizeGb(configuration),
    );
    setNewDiskType(configuration.diskType ?? "pd-standard");
  }, [configuration.diskSizeGb]);

  useEffect(() => {
    const min = getMinDiskSizeGb(configuration);
    if ((newDiskSizeGb ?? 0) < min) {
      setConfig({
        diskSizeGb: min,
      });
      setNewDiskSizeGb(min);
    }
  }, [configuration.acceleratorType]);

  return (
    <div>
      <div style={{ color: "#666", marginBottom: "5px" }}>
        <b>Disk</b>
      </div>
      <InputNumber
        style={{ width: SELECTOR_WIDTH }}
        disabled={disabled}
        min={getMinDiskSizeGb(configuration)}
        max={10000}
        value={newDiskSizeGb}
        addonAfter="GB"
        onChange={(diskSizeGb) => {
          setNewDiskSizeGb(diskSizeGb);
        }}
        onBlur={() => {
          // only set on blur or every keystroke rerenders and cause loss of focus.
          setConfig({
            diskSizeGb: newDiskSizeGb ?? getMinDiskSizeGb(configuration),
          });
        }}
      />
      <div style={{ marginTop: "15px" }}>
        <Select
          style={{ width: SELECTOR_WIDTH }}
          disabled={disabled || (state ?? "deprovisioned") != "deprovisioned"}
          value={newDiskType}
          onChange={(diskType) => {
            setNewDiskType(diskType);
            setConfig({ diskType: diskType ?? "pd-standard" });
          }}
          options={[
            {
              value: "pd-standard",
              label: `Standard (HDD) disk - ${currency(
                priceData.disks["pd-standard"]?.prices[configuration.region] *
                  730,
              )}/GB per month`,
            },
            {
              value: "pd-balanced",
              label: `Balanced (SSD) disks - ${currency(
                priceData.disks["pd-balanced"]?.prices[configuration.region] *
                  730,
              )}/GB per month`,
            },
            {
              value: "pd-ssd",
              label: `Performance (SSD) disks - ${currency(
                priceData.disks["pd-ssd"]?.prices[configuration.region] * 730,
              )}/GB per month`,
            },
          ]}
        ></Select>
      </div>
      <div style={{ color: "#666", marginTop: "5px" }}>
        Set the size and type of the compute server's boot disk.
        {state != "deprovisioned" && <> You can only increase the disk size.</>}
      </div>
    </div>
  );
}

function GPU({ priceData, setConfig, configuration, disabled }) {
  const { acceleratorType, acceleratorCount } = configuration;
  const head = (
    <div style={{ color: "#666", marginBottom: "5px" }}>
      <b>Dedicated NVIDIA P4, T4, P100, V100, L4 and A100 GPU's</b>
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
            acceleratorType: DEFAULT_GPU,
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
      <span style={{ color: "#666" }}>(region will change)</span>
    );
    const memory = priceData.accelerators[acceleratorType].memory;
    return {
      value: acceleratorType,
      search: acceleratorType,
      cost,
      memory,
      label: (
        <div key={acceleratorType}>
          {displayAcceleratorType(acceleratorType, memory)} {price}
        </div>
      ),
    };
  });
  options.sort((a, b) => {
    if (a.cost != null && b.cost != null) {
      return cmp(a.cost, b.cost);
    }
    return cmp(a.memory, b.memory);
  });

  const countOptions: any[] = [];
  const min = priceData.accelerators[acceleratorType]?.count ?? 1;
  const max = priceData.accelerators[acceleratorType]?.max ?? 1;
  for (let i = min; i <= max; i++) {
    countOptions.push({ label: `${i}`, value: i });
  }

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
        <Select
          style={{ marginLeft: "15px", width: "75px" }}
          disabled={disabled}
          options={countOptions}
          value={acceleratorCount}
          onChange={(count) => {
            setConfig({ acceleratorCount: count });
          }}
        />
      </div>
    </div>
  );
}
/*
{acceleratorType?.includes("a100") && configuration.spot ? (
        <div style={{ marginTop: "5px", color: "#666" }}>
          <b>WARNING:</b> A100 spot instances are rarely available. Consider
          standard provisioning instead.
        </div>
      ) : undefined}
*/

function displayAcceleratorType(acceleratorType, memory?) {
  let x = acceleratorType
    .replace("tesla-", "")
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

  ensureConsistentNvidiaL4(priceData, newConfiguration, newChanges);

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
  if (!data) {
    // invalid acceleratorType.
    return;
  }
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
  ensureZoneIsConsistentWithGPU(priceData, configuration, changes);

  // Ensure the count is consistent
  const count = configuration.acceleratorCount ?? 0;
  if (count < data.count) {
    changes["acceleratorCount"] = data.count;
  } else if (count > data.max) {
    changes["acceleratorCount"] = data.max;
  }
}

function ensureZoneIsConsistentWithGPU(priceData, configuration, changes) {
  if (!configuration.acceleratorType) return;

  const data = priceData.accelerators[configuration.acceleratorType];
  if (!data) {
    // invalid acceleratorType.
    return;
  }

  // Ensure the region/zone is consistent with accelerator type
  const prices = data[configuration.spot ? "spot" : "prices"];
  if (prices[configuration.zone] == null) {
    // there are no GPU's in the selected zone of the selected type.
    // If you just explicitly changed the GPU type, then we fix this by changing the zone.
    if (changes["acceleratorType"] != null) {
      // fix the region and zone
      // first, anything in the same region?
      for (const zone in prices) {
        if (zone.startsWith(configuration.region)) {
          // yes!
          changes["zone"] = configuration["zone"] = zone;
          return;
        }
      }
      // find cheapest zone
      let price = 999999999;
      let zoneChoice = "";
      for (const zone in prices) {
        if (prices[zone] < price) {
          price = prices[zone];
          zoneChoice = zone;
        }
      }
      if (zoneChoice) {
        changes["zone"] = configuration["zone"] = zoneChoice;
        changes["region"] = configuration["region"] = zoneToRegion(zoneChoice);
        return;
      }
    } else {
      // You did not change the GPU type, so we  disable the GPU
      configuration["acceleratorType"] = changes["acceleratorType"] = "";
      configuration["acceleratorCount"] = changes["acceleratorCount"] = 0;
      return;
    }
  }
}

// The Nvidia L4 is a little weirder.
function ensureConsistentNvidiaL4(priceData, configuration, changes) {
  const { machineType, acceleratorType } = configuration;
  if (machineType.startsWith("g2-") && !acceleratorType) {
    if (changes.acceleratorType !== undefined) {
      configuration.machineType = changes.machineType = FALLBACK_INSTANCE;
    } else {
      configuration.acceleratorType = changes.acceleratorType = "nvidia-l4";
    }
  }
  const TYPES = ["nvidia-l4", "nvidia-l4-x2", "nvidia-l4-x4", "nvidia-l4-x8"];
  if (acceleratorType == "nvidia-l4") {
    for (const other of TYPES) {
      if (other != "nvidia-l4") {
        if (machineType == priceData.accelerators[other].machineType) {
          configuration.machineType = changes["machineType"] = "g2-standard-4";
          return;
        }
      }
    }
  }
  if (machineType.startsWith("a2-") && !acceleratorType) {
    if (changes.acceleratorType !== undefined) {
      configuration.machineType = changes.machineType = FALLBACK_INSTANCE;
    } else {
      configuration.acceleratorType = changes.acceleratorType =
        "nvidia-tesla-a100";
    }
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
    configuration["machineType"] = changes["machineType"] = FALLBACK_INSTANCE;
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

function Network({ setConfig, configuration, disabled, state, loading }) {
  const [externalIp, setExternalIp] = useState<boolean>(
    !!configuration.externalIp,
  );
  useEffect(() => {
    setExternalIp(!!configuration.externalIp);
  }, [configuration.externalIp]);

  return (
    <div>
      <div style={{ color: "#666", marginBottom: "5px" }}>
        <b>Network</b>
        <br />
        All compute servers have full network access with unlimited ingress for
        free. Outgoing{" "}
        <b>egress traffic costs {currency(EGRESS_COST_PER_GiB)}/GiB</b>.
      </div>
      <Checkbox
        checked={externalIp}
        disabled={disabled || (state ?? "deprovisioned") != "deprovisioned"}
        onChange={() => {
          setExternalIp(!externalIp);
          setConfig({ externalIp: !externalIp });
        }}
      >
        External IP Address
      </Checkbox>
      <div style={{ marginTop: "5px" }}>
        <Typography.Paragraph
          style={{ color: "#666" }}
          ellipsis={{
            expandable: true,
            rows: 2,
            symbol: "more",
          }}
        >
          {/* TODO: we can and will in theory support all this without external
        ip using a gateway. E.g., google cloud shell has ssh to host, etc. */}
          An external IP address enables you to run a public web service and ssh
          directly to your compute server, but costs{" "}
          {configuration.spot
            ? `$${EXTERNAL_IP_COST.spot}/hour`
            : `$${EXTERNAL_IP_COST.standard}/hour`}{" "}
          while the VM is running, and is free when it is not running.
        </Typography.Paragraph>
      </div>
      {externalIp && (
        <DNS
          setConfig={setConfig}
          configuration={configuration}
          loading={loading}
        />
      )}
    </div>
  );
}

function DNS({ setConfig, configuration, loading }) {
  const compute_servers_dns = useTypedRedux("customize", "compute_servers_dns");
  const [showDns, setShowDns] = useState<boolean>(
    !!configuration.externalIp && !!configuration.dns,
  );
  const [dnsError, setDnsError] = useState<string>("");
  const [dns, setDns] = useState<string | undefined>(configuration.dns);
  useEffect(() => {
    if (!dns) return;
    try {
      checkValidDomain(dns);
      setDnsError("");
    } catch (err) {
      setDnsError(`${err}`);
    }
  }, [dns]);

  if (!compute_servers_dns) {
    return null;
  }

  return (
    <div>
      {showDns && (
        <A
          style={{ float: "right" }}
          href={`https://${configuration.dns}.${compute_servers_dns}`}
        >
          <Icon name="external-link" /> https://{dns ?? "*"}.
          {compute_servers_dns}
        </A>
      )}
      <Checkbox
        disabled={loading}
        checked={showDns}
        onChange={() => {
          setShowDns(!showDns);
          if (showDns) {
            // disable on backend.
            console.log("disable on backend");
            setConfig({ dns: "" });
          }
        }}
      >
        Custom Domain ({currency(DNS_COST_PER_HOUR)}/hour when running)
      </Checkbox>
      {showDns && (
        <div style={{ marginTop: "5px" }}>
          <Input
            disabled={loading}
            style={{ margin: "15px 0" }}
            maxLength={63}
            showCount
            allowClear
            value={dns}
            onChange={(e) => {
              const dns = e.target.value.trim();
              setDns(dns);
              if (!dns) {
                setConfig({ dns: "" });
              }
            }}
          />

          <Button
            disabled={configuration.dns == dns || dnsError || loading}
            onClick={() => {
              const s = (dns ?? "").toLowerCase();
              setConfig({ dns: s });
              setDns(s);
            }}
          >
            Set Custom Domain
          </Button>
          {dnsError && dns && (
            <div
              style={{
                background: "red",
                color: "white",
                padding: "5px",
                margin: "10px 0",
              }}
            >
              <div>{dnsError}</div>
              Please enter a valid subdomain name. Subdomains can consist of
              letters (a-z, A-Z), numbers (0-9), and hyphens (-). They cannot
              start or end with a hyphen.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
