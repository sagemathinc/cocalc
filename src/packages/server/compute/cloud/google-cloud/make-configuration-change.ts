import type {
  GoogleCloudConfiguration,
  State,
} from "@cocalc/util/db-schema/compute-servers";
import { setMachineType } from "./client";
import { getServerName } from "./index";
import { getFullMachineType } from "./create-instance";

export const SUPPORTED_CHANGES = ["machineType"];

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
    throw Error(
      "compute server must be 'off' or 'deprovisioned' to change the configuration",
    );
  }

  const name = getServerName({ id });
  const zone = currentConfiguration.zone;

  if (currentConfiguration["machineType"] != newConfiguration["machineType"]) {
    await setMachineType({
      name,
      zone,
      wait: true,
      machineType: getFullMachineType(newConfiguration),
    });
  }
}
