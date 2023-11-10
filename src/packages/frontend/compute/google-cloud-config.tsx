import type {
  State,
  GoogleCloudConfiguration as GoogleCloudConfigurationType,
} from "@cocalc/util/db-schema/compute-servers";
import {
  getMinDiskSizeGb,
  IMAGES,
} from "@cocalc/util/db-schema/compute-servers";
import {
  Button,
  Checkbox,
  Input,
  InputNumber,
  Radio,
  Select,
  Space,
  Spin,
  Switch,
  Table,
  Tooltip,
  Typography,
} from "antd";
import { cmp, plural } from "@cocalc/util/misc";
import computeCost, {
  GoogleCloudData,
  EXTERNAL_IP_COST,
  EGRESS_COST_PER_GiB,
  computeDiskCost,
  markup,
  computeAcceleratorCost,
  computeInstanceCost,
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
import SelectImage from "./select-image";
import ExcludeFromSync from "./exclude-from-sync";

export const SELECTOR_WIDTH = "350px";

const DEFAULT_GPU_CONFIG = {
  acceleratorType: "nvidia-l4",
  acceleratorCount: 1,
  machineType: "g2-standard-4",
  region: "us-central1",
  zone: "us-central1-b",
  image: "pytorch",
};

const FALLBACK_INSTANCE = "n2-standard-4";
// an n1-standard-1 is SO dinky it causes huge trouble
// with downloading/processing models.
const DEFAULT_GPU_INSTANCE = "n1-highmem-4";

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

export default function GoogleCloudConfiguration({
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
      key: "image",
      label: "",
      value: (
        <Image
          state={state}
          disabled={loading || disabled}
          setConfig={setConfig}
          configuration={configuration}
          gpu={configuration.acceleratorType && configuration.acceleratorCount}
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
          disabled={loading}
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
          setConfig={setConfig}
          configuration={configuration}
          loading={loading}
          priceData={priceData}
        />
      ),
    },
    {
      key: "admin",
      label: <></>,
      value: (
        <Admin
          setConfig={setConfig}
          configuration={configuration}
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
          <MoneyStatistic
            value={cost}
            title="Total Cost Per Hour While Running"
          />
          <div style={{ color: "#666", maxWidth: "600px", margin: "auto" }}>
            You pay the above rate while the computer server VM is running. The
            rate is <b>much cheaper</b> when the server is suspended or off, and
            there is no cost when it is deprovisioned. Egress networking charges
            are not included in the above cost, and depend on exactly how much
            data leaves the server. All incoming networking is free.
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
    const price = <CostPerHour cost={cost} extra={"total"} />;
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
          <b>
            <Icon name="global" /> Region
          </b>
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
        <b>
          <Icon name="sliders" /> Provisioning
        </b>
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
        Standard VM's stay running until you stop them, whereas spot VM's are
        incredibly cheap, but{" "}
        <b>will automatically stop when there is a surge in demand.</b>
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
          <b>
            <Icon name="aim" /> Zone
          </b>{" "}
          in {configuration.region} with {configuration.machineType}{" "}
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
  let allOptions = machineTypes
    .filter((machineType) => {
      const { acceleratorType } = configuration;
      if (!acceleratorType) {
        if (machineType.startsWith("g2-") || machineType.startsWith("a2-")) {
          return false;
        }
      } else {
        if (
          acceleratorType == "nvidia-tesla-a100" ||
          acceleratorType == "nvidia-a100-80gb" ||
          acceleratorType == "nvidia-l4"
        ) {
          const machines =
            priceData.accelerators[acceleratorType].machineType[
              configuration.acceleratorCount ?? 1
            ] ?? [];
          return machines.includes(machineType);
        } else {
          return machineType.startsWith("n1-");
        }
      }

      return true;
    })
    .map((machineType) => {
      let cost;
      try {
        cost = computeInstanceCost({
          priceData,
          configuration: { ...configuration, machineType },
        });
      } catch (_) {
        cost = null;
      }
      const data = priceData.machineTypes[machineType];
      const { memory, vcpu } = data;
      return {
        value: machineType,
        search: machineType + ` memory:${memory}  cpu:${vcpu}`,
        cost,
        label: (
          <div key={machineType}>
            {machineType}{" "}
            {cost ? (
              <CostPerHour cost={cost} />
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
        <b>
          <Icon name="microchip" /> Machine Type
        </b>{" "}
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

function BootDisk(props) {
  const {
    setConfig,
    configuration,
    disabled,
    priceData,
    state = "deprovisioned",
  } = props;
  const [newDiskSizeGb, setNewDiskSizeGb] = useState<number | null>(
    configuration.diskSizeGb ?? getMinDiskSizeGb(configuration),
  );
  const [newDiskType, setNewDiskType] = useState<string | null>(
    configuration.diskType ?? "pd-standard",
  );
  useEffect(() => {
    setNewDiskSizeGb(
      configuration.diskSizeGb ?? getMinDiskSizeGb(configuration),
    );
    setNewDiskType(configuration.diskType ?? "pd-standard");
  }, [configuration.diskSizeGb]);

  useEffect(() => {
    if (newDiskSizeGb == null) {
      return;
    }
    const min = getMinDiskSizeGb(configuration);
    if (newDiskSizeGb < min) {
      setNewDiskSizeGb(min);
    }
  }, [configuration.image]);

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
        <b>
          <Icon name="disk-drive" /> Disk
        </b>
      </div>
      <Space direction="vertical">
        <InputNumber
          style={{ width: SELECTOR_WIDTH }}
          disabled={disabled}
          min={
            state == "deprovisioned"
              ? getMinDiskSizeGb(configuration)
              : configuration.diskSizeGb ?? getMinDiskSizeGb(configuration)
          }
          max={65536}
          value={newDiskSizeGb}
          addonAfter="GB"
          onChange={(diskSizeGb) => {
            setNewDiskSizeGb(diskSizeGb);
          }}
          onBlur={() => {
            if (state == "deprovisioned") {
              // only set on blur or every keystroke rerenders and cause loss of focus.
              setConfig({
                diskSizeGb: newDiskSizeGb ?? getMinDiskSizeGb(configuration),
              });
            }
          }}
        />
        {state != "deprovisioned" &&
          !disabled &&
          newDiskSizeGb != null &&
          configuration.diskSizeGb != null && (
            <Button
              type="primary"
              disabled={configuration.diskSizeGb == newDiskSizeGb}
              onClick={() => {
                setConfig({
                  diskSizeGb: newDiskSizeGb,
                });
              }}
            >
              Enlarge by {newDiskSizeGb - configuration.diskSizeGb}GB{" "}
              (additional cost --{" "}
              {currency(
                computeDiskCost({
                  configuration: {
                    ...configuration,
                    diskSizeGb: newDiskSizeGb - configuration.diskSizeGb,
                  },
                  priceData,
                }) * 730,
              )}
              /month)
            </Button>
          )}
      </Space>
      <div style={{ color: "#666", margin: "10px 0" }}>
        Set the size between {getMinDiskSizeGb(configuration)} GB and 65,536 GB.
        {state != "deprovisioned" && (
          <>
            {" "}
            <b>
              You can increase the disk size at any time, even while the VM is
              running.{" "}
            </b>
            You cannot decrease the disk size after you increase it, without
            first deprovisioning the server.
          </>
        )}
      </div>
      <div>
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
              value: "pd-balanced",
              label: (
                <div>
                  Balanced (SSD) disk{" "}
                  <div style={{ fontFamily: "monospace", float: "right" }}>
                    {currency(
                      markup({
                        cost:
                          priceData.disks["pd-balanced"]?.prices[
                            configuration.region
                          ] * 730,
                        priceData,
                      }),
                    )}
                    /GB per month
                  </div>
                </div>
              ),
            },
            {
              value: "pd-ssd",
              label: (
                <div>
                  Performance (SSD) disk{" "}
                  <div style={{ fontFamily: "monospace", float: "right" }}>
                    {currency(
                      markup({
                        cost:
                          priceData.disks["pd-ssd"]?.prices[
                            configuration.region
                          ] * 730,
                        priceData,
                      }),
                    )}
                    /GB per month
                  </div>
                </div>
              ),
            },
            {
              value: "pd-standard",
              label: (
                <div>
                  Standard (HDD) disk{" "}
                  <div style={{ fontFamily: "monospace", float: "right" }}>
                    {currency(
                      markup({
                        cost:
                          priceData.disks["pd-standard"]?.prices[
                            configuration.region
                          ] * 730,
                        priceData,
                      }),
                    )}
                    /GB per month
                  </div>
                </div>
              ),
            },
          ]}
        ></Select>
        {newDiskType == "pd-standard" && (
          <div style={{ marginTop: "10px", color: "#666" }}>
            <b>WARNING:</b> Small standard disks are slow. Expect an extra
            10s-30s of startup time and slower application start. Balanced disks
            are much faster.
          </div>
        )}
        <ExcludeFromSync
          {...props}
          style={{ marginTop: "10px", color: "#666" }}
        />
      </div>
    </div>
  );
}

function Image(props) {
  const { state = "deprovisioned" } = props;
  return (
    <div>
      <div style={{ color: "#666", marginBottom: "5px" }}>
        <b>
          <Icon name="disk-round" /> Image
        </b>
      </div>
      {state == "deprovisioned" && (
        <div style={{ color: "#666", marginBottom: "5px" }}>
          Select compute server image. You will be able to use sudo as root with
          no password, and can install anything into the Ubuntu Linux image,
          including commercial software, via the fast free network.
        </div>
      )}
      <SelectImage style={{ width: SELECTOR_WIDTH }} {...props} />
      {state != "deprovisioned" && (
        <div style={{ color: "#666", marginTop: "5px" }}>
          You can only edit the image when server is deprovisioned.
        </div>
      )}
    </div>
  );
}

// Putting L4 and A100 at top, since they are most
// interesting, then T4 since very affordable.
// We do NOT include the P4, P100, V100 or K80, which are older
// and for which our base image and drivers don't work.
// If for some reason we need them, we will have to switch to
// different base drivers or have even more images
const ACCELERATOR_TYPES = [
  "nvidia-l4",
  "nvidia-tesla-a100",
  "nvidia-a100-80gb",
  "nvidia-tesla-t4",
  // "nvidia-tesla-v100",
  //"nvidia-tesla-p100",
  //"nvidia-tesla-p4",
];

/*
        <A href="https://www.nvidia.com/en-us/data-center/tesla-p100/">P100</A>,{" "}
        <A href="https://www.nvidia.com/en-us/data-center/v100/">V100</A>,{" "}
        <A href="https://www.nvidia.com/content/dam/en-zz/Solutions/design-visualization/solutions/resources/documents1/nvidia-p4-datasheet.pdf">
          P4
        </A>
*/

function GPU({ priceData, setConfig, configuration, disabled }) {
  const { acceleratorType, acceleratorCount } = configuration;
  const head = (
    <div style={{ color: "#666", marginBottom: "5px" }}>
      <b>
        <Icon style={{ float: "right", fontSize: "50px" }} name="gpu" /> NVIDIA
        GPUs: <A href="https://www.nvidia.com/en-us/data-center/a100/">A100</A>,{" "}
        <A href="https://www.nvidia.com/en-us/data-center/l4/">L4</A>, and{" "}
        <A href="https://www.nvidia.com/content/dam/en-zz/Solutions/design-visualization/solutions/resources/documents1/Datasheet_NVIDIA_T4_Virtualization.pdf">
          T4
        </A>
      </b>
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
          setConfig(DEFAULT_GPU_CONFIG);
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

  const options = ACCELERATOR_TYPES.map((acceleratorType) => {
    let cost;
    const config1 = { ...configuration, acceleratorType, acceleratorCount };
    const changes = { acceleratorType, acceleratorCount };
    try {
      cost = computeAcceleratorCost({ priceData, configuration: config1 });
    } catch (_) {
      const newChanges = ensureConsistentConfiguration(
        priceData,
        config1,
        changes,
      );
      cost = computeAcceleratorCost({
        priceData,
        configuration: { ...config1, ...newChanges },
      });
    }
    const memory = priceData.accelerators[acceleratorType].memory;
    return {
      value: acceleratorType,
      search: acceleratorType,
      cost,
      memory,
      label: (
        <div key={acceleratorType}>
          {displayAcceleratorType(acceleratorType, memory)}{" "}
          <CostPerHour cost={cost} />
        </div>
      ),
    };
  });

  const countOptions: any[] = [];
  const min = priceData.accelerators[acceleratorType]?.count ?? 1;
  const max = priceData.accelerators[acceleratorType]?.max ?? 1;
  for (let i = min; i <= max; i *= 2) {
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
        {acceleratorCount && acceleratorType && (
          <div style={{ color: "#666", marginTop: "10px" }}>
            You have selected {acceleratorCount} dedicated{" "}
            {displayAcceleratorType(acceleratorType)}{" "}
            {plural(acceleratorCount, "GPU")}, with a total of{" "}
            {priceData.accelerators[acceleratorType].memory * acceleratorCount}
            GB RAM.
          </div>
        )}
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

  ensureConsistentImage(newConfiguration, newChanges);

  ensureConsistentAccelerator(priceData, newConfiguration, newChanges);

  ensureConsistentNvidiaL4andA100(priceData, newConfiguration, newChanges);

  ensureConsistentRegionAndZoneWithMachineType(
    priceData,
    newConfiguration,
    newChanges,
  );

  ensureConsistentZoneWithRegion(priceData, newConfiguration, newChanges);

  ensureSufficientDiskSize(newConfiguration, newChanges);

  return newChanges;
}

// We make the image consistent with the gpu selection.
function ensureConsistentImage(configuration, changes) {
  const { gpu } = IMAGES[configuration.image] ?? {};
  const gpuSelected =
    configuration.acceleratorType && configuration.acceleratorCount > 0;
  if (gpu == gpuSelected) {
    // they are consistent
    return;
  }
  if (gpu && !gpuSelected) {
    // GPU image but non-GPU machine -- change image to non-GPU
    configuration["image"] = changes["image"] = "python";
  } else if (!gpu && gpuSelected) {
    // GPU machine but not image -- change image to pytorch
    configuration["image"] = changes["image"] = "pytorch";
  }
}

function ensureSufficientDiskSize(configuration, changes) {
  const min = getMinDiskSizeGb(configuration);
  if ((configuration.diskSizeGb ?? 0) < min) {
    changes.diskSizeGb = min;
  }
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
  const { acceleratorType } = configuration;
  if (!acceleratorType) {
    return;
  }
  if (
    acceleratorType == "nvidia-tesla-a100" ||
    acceleratorType == "nvidia-a100-80gb" ||
    acceleratorType == "nvidia-l4"
  ) {
    // L4 and A100 are handled elsewhere.
    return;
  }

  // have a GPU
  const data = priceData.accelerators[acceleratorType];
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
          configuration["machineType"] = changes["machineType"] =
            type.startsWith("n1-") ? DEFAULT_GPU_INSTANCE : type;
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
      // find cheapest zone in the world.
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

// The Nvidia L4 and A100 are a little different
function ensureConsistentNvidiaL4andA100(priceData, configuration, changes) {
  const { machineType, acceleratorType } = configuration;

  // L4 or A100 GPU machine type, but switching to no GPU, so we have
  // to change the machine type
  if (machineType.startsWith("g2-") || machineType.startsWith("a2-")) {
    if (!acceleratorType) {
      // Easy case -- the user is explicitly changing the GPU from being set
      // to NOT be set, and the GPU is L4 or A100.  In this case,
      // we just set the machine type to some non-gpu type
      // and we're done.
      configuration.machineType = changes.machineType = FALLBACK_INSTANCE;
      return;
    }
  }
  if (
    acceleratorType != "nvidia-tesla-a100" &&
    acceleratorType != "nvidia-a100-80gb" &&
    acceleratorType != "nvidia-l4"
  ) {
    // We're not switching to an A100 or L4, so not handled further here.
    return;
  }

  if (!configuration.acceleratorCount) {
    configuration.acceleratorCount = changes.acceleratorCount = 1;
  }

  // Ensure machine type is consistent with the GPU and count we're switching to.
  let machineTypes =
    priceData.accelerators[acceleratorType]?.machineType[
      configuration.acceleratorCount
    ];
  if (machineTypes == null) {
    configuration.acceleratorCount = changes.acceleratorCount = 1;
    machineTypes =
      priceData.accelerators[acceleratorType]?.machineType[
        configuration.acceleratorCount
      ];
  }
  if (machineTypes == null) {
    throw Error("bug -- this can't happen");
  }

  if (!machineTypes.includes(configuration.machineType)) {
    configuration.machineType = changes.machineType =
      machineTypes[0].startsWith("n1-")
        ? DEFAULT_GPU_INSTANCE
        : machineTypes[0];
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
    // invalid machineType
    if (configuration.acceleratorType) {
      configuration["machineType"] = changes["machineType"] =
        DEFAULT_GPU_INSTANCE;
    } else {
      configuration["machineType"] = changes["machineType"] = FALLBACK_INSTANCE;
    }
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

  if (configuration.acceleratorType && configuration.acceleratorCount) {
    // have a GPU -- make sure zone works
    if (
      !priceData.accelerators[configuration.acceleratorType].prices[
        configuration.zone
      ]
    ) {
      // try to find a different zone in the region that works
      let fixed = false;
      const region = zoneToRegion(configuration["zone"]);
      for (const zone in priceData.accelerators[configuration.acceleratorType]
        .prices) {
        if (zone.startsWith(region)) {
          fixed = true;
          configuration.zone = changes.zone = zone;
          break;
        }
      }
      if (!fixed) {
        // just choose cheapest zone in some region
        const zone = cheapestZone(
          priceData.accelerators[configuration.acceleratorType][
            configuration.spot ? "spot" : "prices"
          ],
        );
        configuration.zone = changes.zone = zone;
        configuration.region = changes.region = zoneToRegion(zone);
      }
    }
  }
}

function zoneToRegion(zone: string): string {
  const i = zone.lastIndexOf("-");
  return zone.slice(0, i);
}

function Network({ setConfig, configuration, loading, priceData }) {
  const [externalIp, setExternalIp] = useState<boolean>(
    configuration.externalIp ?? true,
  );
  useEffect(() => {
    setExternalIp(configuration.externalIp ?? true);
  }, [configuration.externalIp]);

  return (
    <div>
      <div style={{ color: "#666", marginBottom: "5px" }}>
        <b>
          <Icon name="network-server" /> Network
        </b>
        <br />
        All compute servers have full network access with unlimited ingress for
        free. Outgoing{" "}
        <b>egress traffic costs {currency(EGRESS_COST_PER_GiB)}/GiB</b>.
      </div>
      <Checkbox
        checked={externalIp}
        disabled={
          true /* compute servers can't work without external ip or Cloud NAT (which costs a lot), so changing this always disabled.  Before: disabled || (state ?? "deprovisioned") != "deprovisioned"*/
        }
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
          An external IP address is required and costs{" "}
          {configuration.spot
            ? `${currency(
                markup({ cost: EXTERNAL_IP_COST.spot, priceData }),
              )}/hour`
            : `${currency(
                markup({
                  cost: EXTERNAL_IP_COST.standard,
                  priceData,
                }),
              )}/hour`}{" "}
          while the VM is running (there is no charge when not running).
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
        Custom Domain Name with SSL ({currency(DNS_COST_PER_HOUR)}/hour when VM
        not deprovisioned)
      </Checkbox>
      {showDns && (
        <A
          style={{ float: "right" }}
          href={`https://${configuration.dns}.${compute_servers_dns}`}
        >
          <Icon name="external-link" /> https://{dns ?? "*"}.
          {compute_servers_dns}
        </A>
      )}
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
            {!dns || configuration.dns != dns
              ? "Enable Custom Domain"
              : "Custom Domain Enabled"}
          </Button>
          <div style={{ color: "#666", margin: "5px 0" }}>
            <Typography.Paragraph
              style={{ color: "#666" }}
              ellipsis={{
                expandable: true,
                rows: 2,
                symbol: "more",
              }}
            >
              A custom DNS A record with{" "}
              <A href="https://developers.cloudflare.com/dns/manage-dns-records/reference/proxied-dns-records/">
                https and http proxying will be created at CloudFlare
              </A>{" "}
              as long as your VM is not deprovisioned. Whenever your VM starts
              running it is allocated an external ip address, and CoCalc updates
              the DNS entry to point at that ip address. A web server with
              self-signed certificate will appear to have a proper certificate
              to website visitors. You can enable or disable custom DNS at any
              time.
            </Typography.Paragraph>
          </div>
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

function cheapestZone(costs: { [zone: string]: number }): string {
  let price = 99999999999999999;
  let choice = "";
  for (const zone in costs) {
    if (costs[zone] < price) {
      choice = zone;
      price = costs[zone];
    }
  }
  return choice;
}

function CostPerHour({ cost, extra }: { cost?: number; extra? }) {
  if (cost == null) {
    return null;
  }
  return (
    <div style={{ float: "right", fontFamily: "monospace" }}>
      {currency(cost)}/hour
      {extra ? (
        <>
          <br />
          {extra}
        </>
      ) : null}
    </div>
  );
}

function Admin({ setConfig, configuration, loading }) {
  const isAdmin = useTypedRedux("account", "is_admin");
  const [test, setTest] = useState<boolean>(configuration.test);
  if (!isAdmin) {
    return null;
  }
  return (
    <div>
      <div style={{ color: "#666", marginBottom: "5px" }}>
        <b>
          <Icon name="users" /> Admin
        </b>
        <br />
        Settings and functionality only available to admins.
        <br />
        <Tooltip title="When you build a new image it is NOT used by default by compute servers until it gets labeled prod=true.  Check this box to test out the newest image.">
          <Checkbox
            disabled={loading}
            checked={test}
            onChange={() => {
              setConfig({ test: !test });
              setTest(!test);
            }}
          >
            Use newest (possibly) unreleased image
          </Checkbox>
        </Tooltip>
      </div>
    </div>
  );
}
