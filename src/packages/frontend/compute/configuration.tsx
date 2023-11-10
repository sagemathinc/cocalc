import type {
  Configuration as ConfigurationType,
  State,
} from "@cocalc/util/db-schema/compute-servers";
import GoogleCloudConfiguration from "./google-cloud-config";
import OnPremConfiguration from "./onprem-config";

interface Props {
  configuration: ConfigurationType;
  editable?: boolean;
  id?: number;
  onChange?: (configuration: ConfigurationType) => void;
  state?: State;
}

export default function Configuration({
  configuration,
  editable,
  id,
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
          Most configuration can only be changed when the server is off.
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
        configuration={configuration}
        onChange={onChange}
        disabled={disabled}
        state={state}
      />
    </>
  );
}

function Config({ configuration, editable, id, onChange, disabled, state }) {
  if (configuration?.cloud == "google-cloud") {
    return (
      <GoogleCloudConfiguration
        configuration={configuration}
        editable={editable}
        id={id}
        onChange={onChange}
        disabled={disabled}
        state={state}
      />
    );
  } else if (configuration?.cloud == "onprem") {
    return (
      <OnPremConfiguration
        configuration={configuration}
        editable={editable}
        id={id}
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
