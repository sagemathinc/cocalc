import type {
  State,
  HyperstackConfiguration,
} from "@cocalc/util/db-schema/compute-servers";
import { Divider, Select, Spin } from "antd";
import { getHyperstackPriceData, setServerConfiguration } from "./api";
import { useEffect, useMemo, useState } from "react";
import SelectImage, { ImageDescription, ImageLinks } from "./select-image";
import ExcludeFromSync from "./exclude-from-sync";
import ShowError from "@cocalc/frontend/components/error";
import Ephemeral from "./ephemeral";
import Proxy from "./proxy";
import { useImages } from "./images-hook";
import type { HyperstackPriceData } from "@cocalc/util/compute/cloud/hyperstack/pricing";
import computeCost from "@cocalc/util/compute/cloud/hyperstack/compute-cost";
import { commas, currency, field_cmp, plural } from "@cocalc/util/misc";
import {
  optionKey,
  markup,
  PurchaseOption,
} from "@cocalc/util/compute/cloud/hyperstack/pricing";
import NVIDIA from "./nvidia";
import CostOverview from "./cost-overview";
import { GPU_SPECS } from "@cocalc/util/compute/gpu-specs";

interface Props {
  configuration: HyperstackConfiguration;
  editable?: boolean;
  // if id not set, then doesn't try to save anything to the backend
  id?: number;
  project_id: string;
  // called whenever changes are made.
  onChange?: (configuration: HyperstackConfiguration) => void;
  disabled?: boolean;
  state?: State;
  data?;
}

export default function HyperstackConfig({
  configuration: configuration0,
  editable,
  id,
  project_id,
  onChange,
  disabled,
  state,
  data,
}: Props) {
  const [priceData, setPriceData] = useState<HyperstackPriceData | null>(null);
  const [IMAGES, ImagesError] = useImages();
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [configuration, setLocalConfiguration] =
    useState<HyperstackConfiguration>(configuration0);
  const [cost, setCost] = useState<number | null>(null);

  const options = useMemo(() => {
    if (priceData == null) {
      return null;
    }
    return Object.values(priceData.options)
      .filter((x: PurchaseOption) => (x.available ?? 0) > 0)
      .sort(field_cmp("cost_per_hour"))
      .map((x: PurchaseOption) => {
        const gpu = toGPU(x.gpu);
        const gpuSpec = GPU_SPECS[gpu];
        return {
          label: (
            <div style={{ display: "flex", minWidth:'700px', overflow:'hidden' }}>
              <div
                style={{
                  flex: 1,
                }}
              >
                {x.gpu_count} × {gpu.replace("-PCIe", "")}
              </div>
              <div style={{ flex: 1 }}>
                {currency(markup({ cost: x.cost_per_hour, priceData }))}/hour
              </div>
              <div style={{ flex: 1.2 }}>
                <b style={{ color: "#666" }}>GPU RAM:</b>{" "}
                {x.gpu_count * gpuSpec.memory} GB
              </div>
              {/* <div style={{ flex: 1 }}>
                <b style={{ color: "#666" }}>CUDA cores:</b>{" "}
                {gpuSpec.cuda_cores ? x.gpu_count * gpuSpec.cuda_cores : "-"}
              </div>*/}
              <div style={{ flex: 1 }}>
                <b style={{ color: "#666" }}>vCPUs:</b> {x.cpu}
              </div>
              <div style={{ flex: 1 }}>
                <b style={{ color: "#666" }}>RAM:</b> {x.ram} GB
              </div>
              <div style={{ flex: 1 }}>
                <b style={{ color: "#666" }}>Disk:</b> {x.disk + x.ephemeral} GB
              </div>
            </div>
          ),
          value: `${x.region_name}|${x.flavor_name}`,
          x,
        };
      });
  }, [priceData]);

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

  useEffect(() => {
    if (!editable) {
      setLocalConfiguration(configuration0);
    }
  }, [configuration0]);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const data = await getHyperstackPriceData();
        setPriceData(data);
      } catch (err) {
        setError(`${err}`);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const setConfig = async (changes) => {
    try {
      const newConfiguration = { ...configuration, ...changes };
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

  if (!editable || !project_id) {
    return (
      <Specs
        flavor_name={configuration.flavor_name}
        region_name={configuration.region_name}
        priceData={priceData}
      />
    );
  }

  if (ImagesError != null) {
    return ImagesError;
  }

  return (
    <div style={{ marginBottom: "30px" }}>
      <div style={{ color: "#666", marginBottom: "10px" }}>
        <ShowError error={error} setError={setError} />
        {cost != null && priceData != null && (
          <CostOverview
            cost={cost}
            description={
              <>
                You pay <b>{currency(cost)}/hour</b> while the computer server
                is running. The rate is{" "}
                <b>
                  {currency(
                    computeCost({ configuration, priceData, state: "off" }),
                  )}
                  /hour
                </b>{" "}
                when the server is off, and there is no cost when it is
                deprovisioned. All incoming and outgoing network data transfer
                is free. This is a standard instance and won't be interrupted
                when running; however, when it is off, there is no guarantee
                that you will be able to run it.
              </>
            }
          />
        )}{" "}
        {options != null && (
          <>
            <div style={{ marginBottom: "5px" }}>
              <b>Machine Type</b>
              <br />
              There are {options.length} models available right now. Select your
              model, which includes at least one NVIDIA GPU. Your selection
              determines the number of CPUs, RAM and disk space.
            </div>
            <MachineType
              options={options}
              setConfig={setConfig}
              configuration={configuration}
              state={state}
              disabled={disabled}
              priceData={priceData}
            />
          </>
        )}
      </div>
      <Image
        state={state}
        disabled={loading || disabled}
        setConfig={setConfig}
        configuration={configuration}
      />
      <Divider />
      <Proxy
        id={id}
        project_id={project_id}
        setConfig={setConfig}
        configuration={configuration}
        data={data}
        state={state}
        IMAGES={IMAGES}
      />
      {loading && <Spin style={{ marginLeft: "15px" }} />}
      <ShowError error={error} setError={setError} />
    </div>
  );
}

export function toGPU(gpu) {
  gpu = gpu.replace("G-", "GB-");
  if (gpu.endsWith("-sm")) {
    return gpu.slice(0, -3);
  }
  return gpu;
}

function MachineType({
  options,
  disabled,
  setConfig,
  configuration,
  state,
  priceData,
}) {
  if (!priceData || options == null) {
    return <Spin />;
  }
  const value = `${configuration.region_name}|${configuration.flavor_name}`;
  return (
    <div>
      <Select
        disabled={disabled || (state ?? "deprovisioned") != "deprovisioned"}
        style={{ width: "100%", marginBottom: "10px" }}
        value={value}
        options={options}
        onChange={(value) => {
          const [region_name, flavor_name] = value.split("|");
          setConfig({ region_name, flavor_name });
        }}
      />
      <br />
      <Specs
        flavor_name={configuration.flavor_name}
        region_name={configuration.region_name}
        priceData={priceData}
      />
    </div>
  );
}

function Specs({ flavor_name, region_name, priceData }) {
  const data = priceData?.options[optionKey({ flavor_name, region_name })];

  if (data == null) {
    return (
      <div>
        {flavor_name} in {region_name}
      </div>
    );
  }
  return (
    <span>
      Standard {flavor_name} with{" "}
      <NVIDIA gpu={toGPU(data.gpu)} count={data.gpu_count} />, {data.cpu}{" "}
      {plural(data.cpu, "vCPU")}, {commas(data.ram)}GB RAM,{" "}
      {commas(data.disk + data.ephemeral)}
      GB SSD disk in {region_name.toLowerCase()}.
    </span>
  );
}

function Image(props) {
  const { state = "deprovisioned" } = props;
  return (
    <div>
      <div style={{ color: "#666", marginBottom: "5px" }}>
        <b>Image</b>
      </div>
      {(state == "deprovisioned" || state == "off") && (
        <div style={{ color: "#666", marginBottom: "5px" }}>
          Select compute server image. You will be able to use sudo with no
          password and can easily install anything into the Ubuntu Linux image.
          Click "advanced" for more options, which may be less tested or take
          MUCH longer to start up the first time, depending on image size.
        </div>
      )}
      <SelectImage {...props} gpu={true} arch={"x86_64"} maxDockerSizeGb={2} />
      <div style={{ color: "#666", marginTop: "5px" }}>
        <ImageDescription configuration={props.configuration} />
        <ImageLinks
          image={props.configuration.image}
          style={{ flexDirection: "row" }}
        />
        {!(state == "deprovisioned" || state == "off") && (
          <div style={{ color: "#666", marginTop: "5px" }}>
            You can only edit the image when server is deprovisioned or off.
          </div>
        )}
      </div>
      <ExcludeFromSync {...props} />
      <Divider />
      <Ephemeral style={{ marginTop: "30px" }} {...props} />
    </div>
  );
}
