import type { Configuration as ConfigurationType } from "@cocalc/util/db-schema/compute-servers";
import GoogleCloudConfiguration from "./google-cloud-config";

interface Props {
  configuration: ConfigurationType;
  editable?: boolean;
  id?: number;
}

export default function Configuration({ configuration, editable, id }: Props) {
  if (configuration?.cloud == "google-cloud") {
    return (
      <GoogleCloudConfiguration
        configuration={configuration}
        editable={editable}
        id={id}
      />
    );
  }
  return <span>{JSON.stringify(configuration)}</span>;
}
