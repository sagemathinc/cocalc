import type {
  State,
  HyperstackConfiguration,
} from "@cocalc/util/db-schema/compute-servers";
import { Divider, Select, Spin } from "antd";
import { getHyperstackPriceData, setServerConfiguration } from "./api";
import { useEffect, useState } from "react";
import SelectImage, { ImageDescription, ImageLinks } from "./select-image";
import ExcludeFromSync from "./exclude-from-sync";
import ShowError from "@cocalc/frontend/components/error";
import Ephemeral from "./ephemeral";
import { SELECTOR_WIDTH } from "./google-cloud-config";
import Proxy from "./proxy";
import { useImages } from "./images-hook";
import type { HyperstackPriceData } from "@cocalc/util/compute/cloud/hyperstack/pricing";

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
      <div>
        {configuration0.flavor_name} in {configuration0.region_name}
      </div>
    );
  }

  if (ImagesError != null) {
    return ImagesError;
  }

  return (
    <div style={{ marginBottom: "30px" }}>
      <div style={{ color: "#666", marginBottom: "5px" }}>
        <b>GPU</b>
      </div>
      <Select
        disabled={loading || disabled}
        style={{ width: SELECTOR_WIDTH, marginBottom: "10px" }}
        options={[{ label: "", value: "x86_64" }]}
        value={"x86_64"}
        onChange={(arch) => {
          setConfig({ arch });
        }}
      />
      <Image
        state={state}
        disabled={loading || disabled}
        setConfig={setConfig}
        configuration={configuration}
      />
      <ShowError error={error} setError={setError} />
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
      <pre>{JSON.stringify(priceData ?? {}, undefined, 2)}</pre>
    </div>
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
        </div>
      )}
      <SelectImage
        style={{ width: SELECTOR_WIDTH }}
        {...props}
        gpu={!!props.configuration.gpu}
        arch={props.configuration.arch}
      />
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
