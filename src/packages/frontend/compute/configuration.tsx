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
  if (editable && (state ?? "off") != "off" && state != "deleted") {
    return (
      <>
        <div style={{ fontWeight: 250 }}>
          You can only change the configuration when the VM is off or deleted.
        </div>
        <Config editable={false} id={id} configuration={configuration} onChange={onChange} />
      </>
    );
  }
  return (
    <Config
      editable={editable}
      id={id}
      configuration={configuration}
      onChange={onChange}
    />
  );
}

function Config({ configuration, editable, id, onChange }) {
  if (configuration?.cloud == "google-cloud") {
    return (
      <GoogleCloudConfiguration
        configuration={configuration}
        editable={editable}
        id={id}
        onChange={onChange}
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
