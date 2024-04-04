import type {
  Configuration as ConfigurationType,
  State,
} from "@cocalc/util/db-schema/compute-servers";
import GoogleCloudConfiguration from "./google-cloud-config";
import OnPremConfiguration from "./onprem-config";
import HyperstackConfiguration from "./cloud/hyperstack/config";

interface Props {
  configuration: ConfigurationType;
  data?;
  editable?: boolean;
  id?: number;
  project_id?: string;
  onChange?: (configuration: ConfigurationType) => void;
  state?: State;
}

export default function Configuration({
  configuration,
  data,
  editable,
  id,
  project_id,
  onChange,
  state,
}: Props) {
  const disabled =
    (state ?? "deprovisioned") != "deprovisioned" && state != "off";
  return (
    <>
      {editable && disabled && (
        <div
          style={{
            fontWeight: 250,
            textAlign: "center",
            maxWidth: "600px",
            margin: "auto 15px",
            borderBottom: "1px solid #aaa",
            marginBottom: "15px",
            paddingBottom: "15px",
          }}
        >
          Most configuration can only be changed when the server is off, and
          some things can only be changed if you deprevision the server (which
          deletes the disk).
          {configuration?.cloud == "google-cloud" ? (
            <b>
              <br />
              The disk can be instantly enlarged at any time without a reboot.
            </b>
          ) : (
            ""
          )}
        </div>
      )}
      <Config
        editable={editable}
        id={id}
        project_id={project_id}
        configuration={configuration}
        data={data}
        onChange={onChange}
        disabled={disabled}
        state={state}
      />
    </>
  );
}

function Config({
  configuration,
  data,
  editable,
  id,
  project_id,
  onChange,
  disabled,
  state,
}) {
  if (configuration?.cloud == "google-cloud") {
    return (
      <GoogleCloudConfiguration
        configuration={configuration}
        data={data}
        editable={editable}
        id={id}
        project_id={project_id}
        onChange={onChange}
        disabled={disabled}
        state={state}
      />
    );
  } else if (configuration?.cloud == "onprem") {
    return (
      <OnPremConfiguration
        configuration={configuration}
        data={data}
        editable={editable}
        id={id}
        project_id={project_id}
        onChange={onChange}
        disabled={disabled}
        state={state}
      />
    );
  } else if (configuration?.cloud == "hyperstack") {
    return (
      <HyperstackConfiguration
        configuration={configuration}
        data={data}
        editable={editable}
        id={id}
        project_id={project_id}
        onChange={onChange}
        disabled={disabled}
        state={state}
      />
    );
  } else {
    return (
      <span>
        Configuration not implemented: {JSON.stringify(configuration)}
      </span>
    );
  }
}
