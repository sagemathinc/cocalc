import type {
  Configuration as ConfigurationType,
  State,
} from "@cocalc/util/db-schema/compute-servers";
import GoogleCloudConfiguration from "./google-cloud-config";

interface Props {
  configuration: ConfigurationType;
  editable?: boolean;
  id?: number;
  state?: State;
}

export default function Configuration({
  configuration,
  editable,
  id,
  state,
}: Props) {
  return (
    <>
      <Extra editable={editable} id={id} state={state} />
      <Config editable={editable} id={id} configuration={configuration} />
    </>
  );
}

function Config({ configuration, editable, id }) {
  if (configuration?.cloud == "google-cloud") {
    return (
      <GoogleCloudConfiguration
        configuration={configuration}
        editable={editable}
        id={id}
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

function Extra({ editable, id, state }) {
  if (editable && id) {
    if (state != "off") {
      return (
        <div style={{ fontWeight: 250 }}>Stop VM off to edit configuration</div>
      );
    } else {
      return (
        <div style={{ fontWeight: 250 }}>
          Click on configuration below to edit it
        </div>
      );
    }
  } else {
    return null;
  }
}
