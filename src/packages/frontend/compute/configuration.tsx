import type {
  Configuration as ConfigurationType,
  ComputeServerTemplate,
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
  setCloud?;
  template?: ComputeServerTemplate;
}

export default function Configuration({
  configuration,
  data,
  editable,
  id,
  project_id,
  onChange,
  state,
  setCloud,
  template,
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
            margin: "15px auto",
            borderBottom: "1px solid #aaa",
            marginBottom: "15px",
            paddingBottom: "15px",
          }}
        >
          Most configuration can only be changed when the server is off, and
          some things can only be changed if you deprovision the server (which
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
        setCloud={setCloud}
        template={template}
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
  setCloud,
  template,
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
        setCloud={setCloud}
        template={template}
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
        template={template}
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
        setCloud={setCloud}
        template={template}
      />
    );
  } else if (configuration == null) {
    return <span>Not Configured</span>;
  } else {
    return <span>Unknown Cloud: '{JSON.stringify(configuration?.cloud)}'</span>;
  }
}
