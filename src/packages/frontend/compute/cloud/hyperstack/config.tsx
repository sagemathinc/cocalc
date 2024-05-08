import type {
  State,
  HyperstackConfiguration,
  ComputeServerTemplate,
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
//import GPU from "./gpu";
import MachineType from "./machine-type";
import Specs from "./specs";
import Image from "./image";
import Disk from "./disk";
import Ephemeral from "@cocalc/frontend/compute/ephemeral";
import ExcludeFromSync from "@cocalc/frontend/compute/exclude-from-sync";
import { useTypedRedux } from "@cocalc/frontend/app-framework";
import DNS from "@cocalc/frontend/compute/cloud/common/dns";
import AllowCollaboratorControl from "@cocalc/frontend/compute/allow-collaborator-control";
import Template from "@cocalc/frontend/compute/cloud/common/template";
import { A } from "@cocalc/frontend/components/A";

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
  setCloud?;
  template?: ComputeServerTemplate;
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
  setCloud,
  template,
}: Props) {
  const [priceData, setPriceData] = useState<HyperstackPriceData | null>(null);
  const [IMAGES, ImagesError] = useImages();
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [configuration, setLocalConfiguration] =
    useState<HyperstackConfiguration>(configuration0);
  const [cost, setCost] = useState<number | null>(null);
  state = state ?? "deprovisioned";

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const data = await getHyperstackPriceData();
        //window.x = { priceData: data };
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
        diskSizeGb={configuration.diskSizeGb}
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
    //     {
    //       key: "gpu",

    //       value: (
    //         <GPU
    //           state={state}
    //           disabled={
    //             loading || disabled || (state != "deprovisioned" && state != "off")
    //           }
    //           priceData={priceData}
    //           setConfig={setConfig}
    //           configuration={configuration}
    //         />
    //       ),
    //     },
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
            setCloud={setCloud}
            configuration={configuration}
            state={state}
            disabled={
              loading ||
              disabled ||
              (state != "deprovisioned" && state != "off")
            }
            priceData={priceData}
          />
        </>
      ),
    },
    //     {
    //       key: "provisioning",
    //       value: <Provisioning />,
    //     },
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
          data={data}
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
      key: "dns",
      value: (
        <div>
          <Icon name="network" /> <b style={{ color: "#666" }}>Domain Name</b>
          <DNS
            setConfig={setConfig}
            configuration={configuration}
            loading={loading}
          />
        </div>
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
    {
      key: "allow-collaborator-control",
      label: <></>,
      value: (
        <AllowCollaboratorControl
          setConfig={setConfig}
          configuration={configuration}
          loading={loading}
        />
      ),
    },
    {
      key: "admin",
      label: <></>,
      value: (
        <Admin id={id} configuration={configuration} template={template} />
      ),
    },
  ];

  const showError = (
    <ShowError
      error={error}
      setError={setError}
      style={{ width: "100%", margin: "5px 0" }}
    />
  );

  return (
    <div style={{ marginBottom: "30px" }}>
      <div style={{ color: "#666", marginBottom: "10px" }}>
        {showError}
        {loading && (
          <div style={{ textAlign: "center" }}>
            <Spin style={{ marginLeft: "15px" }} />
          </div>
        )}
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
                <b>is free</b>, and{" "}
                <A href="https://www.hyperstack.cloud/why-hyperstack">
                  Hyperstack's data centers are 100% Renewably Powered
                </A>{" "}
                via hydro-energy, housed within{" "}
                <A href="https://www.hyperstack.cloud/blog/company-news/nexgen-cloud-and-aq-compute-advance-towards-net-zero-ai-supercloud">
                  sustainable data centers
                </A>
                .
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
            diskSizeGb={configuration.diskSizeGb}
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

      {showError}
    </div>
  );
}

function Admin({ id, configuration, template }) {
  const isAdmin = useTypedRedux("account", "is_admin");
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
        <pre>
          id={id}, configuration={JSON.stringify(configuration, undefined, 2)}
        </pre>
        <Template id={id} template={template} />
      </div>
    </div>
  );
}
