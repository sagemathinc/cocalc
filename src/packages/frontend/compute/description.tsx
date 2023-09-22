import {
  CLOUDS_BY_NAME,
  STATE_INFO,
} from "@cocalc/util/db-schema/compute-servers";
import Configuration from "./configuration";

export default function Description({ state, cloud, configuration, id }) {
  const stateInfo = STATE_INFO[state] ?? {};
  const cloudInfo = CLOUDS_BY_NAME[cloud] ?? {};
  console.log({ state, stateInfo, cloud, cloudInfo });
  return (
    <div>
      Hosted on {cloudInfo.label ?? "Unknown"}. Currently{" "}
      {stateInfo.label ?? "in an unknown state"}.{" "}
      <Configuration configuration={configuration} /> (Id={id})
    </div>
  );
}
