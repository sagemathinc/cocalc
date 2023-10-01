import type {
  GoogleCloudConfiguration,
  State,
} from "@cocalc/util/db-schema/compute-servers";

export async function makeConfigurationChange({
  id,
  state,
  currentConfiguration,
  newConfiguration,
}: {
  id: number;
  state: State;
  currentConfiguration: GoogleCloudConfiguration;
  newConfiguration: GoogleCloudConfiguration;
}) {
  if (state == "deprovisioned") {
    // nothing to do
    return;
  }
  if (state != "off") {
    // for now, nothing that we can do
    throw Error("machine must be off to change the configuration");
  }
}
