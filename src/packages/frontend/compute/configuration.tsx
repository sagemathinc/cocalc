import type {
  Configuration as ConfigurationType,
  State,
} from "@cocalc/util/db-schema/compute-servers";
import GoogleCloudConfiguration from "./google-cloud-config";

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
  const disabled = (state ?? "deprovisioned") != "deprovisioned" && state != "off";
  return (
    <>
      {editable && disabled && (
        <div style={{ fontWeight: 250 }}>
          You can only change the configuration when the VM is off or deprovisioned.
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
  } else {
    return (
      <span>
        Configuration not implemented: {JSON.stringify(configuration)}
      </span>
    );
  }
}
