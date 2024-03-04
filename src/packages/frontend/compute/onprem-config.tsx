import type {
  State,
  OnPremCloudConfiguration,
} from "@cocalc/util/db-schema/compute-servers";
import { ON_PREM_DEFAULTS } from "@cocalc/util/db-schema/compute-servers";
import { Checkbox, Divider, Select, Spin } from "antd";
import { setServerConfiguration } from "./api";
import { useEffect, useState } from "react";
import SelectImage, { ImageDescription, ImageLinks } from "./select-image";
import ExcludeFromSync from "./exclude-from-sync";
import ShowError from "@cocalc/frontend/components/error";
import { CopyToClipBoard } from "@cocalc/frontend/components";
import Ephemeral from "./ephemeral";
import { SELECTOR_WIDTH } from "./google-cloud-config";
import { A } from "@cocalc/frontend/components";

interface Props {
  configuration: OnPremCloudConfiguration;
  editable?: boolean;
  // if id not set, then doesn't try to save anything to the backend
  id?: number;
  // called whenever changes are made.
  onChange?: (configuration: OnPremCloudConfiguration) => void;
  disabled?: boolean;
  state?: State;
}

export default function OnPremCloudConfiguration({
  configuration: configuration0,
  editable,
  id,
  onChange,
  disabled,
  state,
}: Props) {
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [configuration, setLocalConfiguration] =
    useState<OnPremCloudConfiguration>(configuration0);

  useEffect(() => {
    if (!editable) {
      setLocalConfiguration(configuration0);
    }
  }, [configuration0]);

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

  if (!editable) {
    return (
      <div>
        On Prem {configuration.arch == "arm64" ? "ARM64" : "x86_64"} Linux VM
        {configuration.gpu ? " that has an NVIDIA GPU" : ""}.
      </div>
    );
  }

  return (
    <div>
      <div style={{ color: "#666", marginBottom: "15px" }}>
        You can connect any UBUNTU VIRTUAL MACHINE that you have a root acount
        on to this CoCalc project and seamlessly run Jupyter notebooks and
        terminals using it. On Prem compute servers are currently free.
      </div>
      <div style={{ color: "#666", marginBottom: "5px" }}>
        <b>Architecture</b>
      </div>
      <Select
        disabled={loading || disabled}
        style={{ width: SELECTOR_WIDTH }}
        options={[
          { label: "x86_64 (e.g., Linux VM on Intel or AMD)", value: "x86_64" },
          {
            label: "ARM 64 (e.g., Linux VM on an M1 Mac)",
            value: "arm64",
            disabled: configuration.gpu,
          },
        ]}
        value={configuration.arch ?? "x86_64"}
        onChange={(arch) => {
          setConfig({ arch });
        }}
      />
      <div style={{ margin: "15px 0" }}>
        <Checkbox
          disabled={
            loading ||
            disabled ||
            configuration.arch ==
              "arm64" /* we only have x86_64 docker images */
          }
          style={{ width: SELECTOR_WIDTH }}
          checked={configuration.gpu}
          onChange={() => {
            setConfig({
              gpu: !configuration.gpu,
              image:
                ON_PREM_DEFAULTS[!configuration.gpu ? "gpu" : "cpu"]?.image,
            });
          }}
        >
          NVIDIA GPU with CUDA 12.x installed
        </Checkbox>
      </div>
      <Image
        state={state}
        disabled={loading || disabled}
        setConfig={setConfig}
        configuration={configuration}
      />
      <ShowError error={error} setError={setError} />
      {loading && <Spin style={{ marginLeft: "15px" }} />}
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
      </div>
      <ExcludeFromSync {...props} />
      <Divider />
      <Ephemeral style={{ marginTop: "30px" }} {...props} />
      {!(state == "deprovisioned" || state == "off") && (
        <div style={{ color: "#666", marginTop: "5px" }}>
          You can only edit the image when server is deprovisioned or off.
        </div>
      )}
    </div>
  );
}
