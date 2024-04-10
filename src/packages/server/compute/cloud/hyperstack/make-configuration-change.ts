import type {
  HyperstackConfiguration,
  State,
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
  "proxy",
];

export const RUNNING_CHANGES = [
  "ephemeral",
  "diskSizeGb",
  "allowCollaboratorControl",
  "authToken",
  "proxy",
];

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
    (currentConfiguration.diskSizeGb ?? DEFAULT_DISK) <
      (newConfiguration.diskSizeGb ?? DEFAULT_DISK)
  ) {
    await increaseDiskSize({
      id,
      diskSizeGb: newConfiguration.diskSizeGb ?? DEFAULT_DISK,
      state,
    });
    return;
  }
}
