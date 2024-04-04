import type {
  State,
  HyperstackConfiguration,
} from "@cocalc/util/db-schema/compute-servers";
import { Divider, Spin, Table } from "antd";
import {
  getHyperstackPriceData,
  setServerConfiguration,
} from "@cocalc/frontend/compute/api";
import { useEffect, useState } from "react";
import ShowError from "@cocalc/frontend/components/error";
import Proxy from "@cocalc/frontend/compute/proxy";
import { useImages } from "@cocalc/frontend/compute/images-hook";
import type { HyperstackPriceData } from "@cocalc/util/compute/cloud/hyperstack/pricing";
import computeCost from "@cocalc/util/compute/cloud/hyperstack/compute-cost";
import { currency } from "@cocalc/util/misc";
import CostOverview from "@cocalc/frontend/compute/cost-overview";
import { Icon } from "@cocalc/frontend/components/icon";
import GPU from "./gpu";
import MachineType from "./machine-type";
import Specs from "./specs";
import Image from "./image";
import Disk from "./disk";
import Ephemeral from "@cocalc/frontend/compute/ephemeral";
import ExcludeFromSync from "@cocalc/frontend/compute/exclude-from-sync";

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

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const data = await getHyperstackPriceData();
        // window.x = { priceData: data };
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

  useEffect(() => {
    if (!editable) {
      setLocalConfiguration(configuration0);
    }
  }, [configuration0]);

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

  const columns = [
    {
      dataIndex: "value",
      key: "value",
    },
  ];

  const dataSource = [
    {
      key: "provisioning",
      value: <Provisioning />,
    },
    {
      key: "gpu",

      value: (
        <GPU
          state={state}
          disabled={loading || disabled}
          priceData={priceData}
          setConfig={setConfig}
          configuration={configuration}
        />
      ),
    },
    {
      key: "machine",
      value: (
        <>
          <div style={{ marginBottom: "5px" }}>
            <b style={{ color: "#666" }}>Machine Type</b>
            <br />
          </div>
          <MachineType
            setConfig={setConfig}
            configuration={configuration}
            state={state}
            disabled={disabled}
            priceData={priceData}
          />
        </>
      ),
    },
    {
      key: "image",
      value: (
        <Image
          state={state}
          disabled={loading || disabled}
          setConfig={setConfig}
          configuration={configuration}
        />
      ),
    },
    {
      key: "disk",
      value: (
        <Disk
          id={id}
          disabled={loading}
          setConfig={setConfig}
          configuration={configuration}
          priceData={priceData}
          state={state}
          IMAGES={IMAGES}
        />
      ),
    },
    {
      key: "exclude",
      value: (
        <ExcludeFromSync
          id={id}
          disabled={loading}
          setConfig={setConfig}
          configuration={configuration}
          state={state}
          style={{ marginTop: "10px", color: "#666" }}
        />
      ),
    },
    {
      key: "proxy",
      value: (
        <Proxy
          id={id}
          project_id={project_id}
          setConfig={setConfig}
          configuration={configuration}
          data={data}
          state={state}
          IMAGES={IMAGES}
        />
      ),
    },
    {
      key: "ephemeral",
      label: <></>,
      value: (
        <Ephemeral
          setConfig={setConfig}
          configuration={configuration}
          loading={loading}
        />
      ),
    },
  ];

  return (
    <div style={{ marginBottom: "30px" }}>
      <div style={{ color: "#666", marginBottom: "10px" }}>
        {loading && (
          <div style={{ textAlign: "center" }}>
            <Spin style={{ marginLeft: "15px" }} />
          </div>
        )}
        <ShowError error={error} setError={setError} />
        {cost != null && priceData != null && (
          <CostOverview
            cost={cost}
            description={
              <>
                You pay <b>{currency(cost)}/hour</b> while the server is running
                for compute and storage. You only pay{" "}
                <b>
                  {currency(
                    computeCost({ configuration, priceData, state: "off" }),
                  )}
                  /hour
                </b>{" "}
                for storage when the server is off, and there is no cost when
                the server is deprovisioned. All network data transfer{" "}
                <b>is free</b>.
              </>
            }
          />
        )}
        <Divider />
        <div style={{ textAlign: "center", margin: "10px 80px" }}>
          <Specs
            flavor_name={configuration.flavor_name}
            region_name={configuration.region_name}
            priceData={priceData}
          />
        </div>
        <Divider />
        <Table
          showHeader={false}
          style={{ marginTop: "5px" }}
          columns={columns}
          dataSource={dataSource}
          pagination={false}
        />
      </div>

      <ShowError error={error} setError={setError} />
    </div>
  );
}

function Provisioning({}) {
  return (
    <div>
      <div style={{ color: "#666", marginBottom: "5px" }}>
        <b>
          <Icon name="sliders" /> Provisioning: Standard
        </b>
      </div>
      <div style={{ color: "#666", marginTop: "5px" }}>
        Hyperstack servers are dedicated to you and{" "}
        <b>
          <i>will NOT automatically stop</i>
        </b>{" "}
        even if there is a surge in demand.
      </div>
    </div>
  );
}
