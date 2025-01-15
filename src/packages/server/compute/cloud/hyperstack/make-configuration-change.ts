import {
  type HyperstackConfiguration,
  type State,
  AUTOMATIC_SHUTDOWN_FIELDS,
} from "@cocalc/util/db-schema/compute-servers";
import { DEFAULT_DISK } from "@cocalc/util/compute/cloud/hyperstack/api-types";
import getLogger from "@cocalc/backend/logger";
import { increaseDiskSize } from "./disk";

const logger = getLogger("server:compute:make-configuration-change");

export const SUPPORTED_CHANGES = [
  "ephemeral",
  "flavor_name",
  "region_name",
  "diskSizeGb",
  "excludeFromSync",
  "autoRestart",
  "allowCollaboratorControl",
  "authToken",
].concat(AUTOMATIC_SHUTDOWN_FIELDS);

export const RUNNING_CHANGES = [
  "ephemeral",
  "diskSizeGb",
  "allowCollaboratorControl",
  "authToken",
  "proxy",
].concat(AUTOMATIC_SHUTDOWN_FIELDS);

export async function makeConfigurationChange({
  id,
  state,
  currentConfiguration,
  newConfiguration,
}: {
  id: number;
  state: State;
  currentConfiguration: HyperstackConfiguration;
  newConfiguration: HyperstackConfiguration;
}) {
  logger.debug("makeConfigurationChange", {
    id,
    state,
    currentConfiguration,
    newConfiguration,
  });
  if (state == "deprovisioned") {
    // nothing to do since everything happens only when we start
    return;
  }
  if (
    state == "running" &&
    newConfiguration.diskSizeGb != null &&
    (currentConfiguration.diskSizeGb ?? DEFAULT_DISK) <
      (newConfiguration.diskSizeGb ?? DEFAULT_DISK)
  ) {
    await increaseDiskSize({ id, state, configuration: newConfiguration });
    return;
  }
}
