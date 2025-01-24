import  {
  type GoogleCloudConfiguration,
  type State,
  AUTOMATIC_SHUTDOWN_FIELDS,
} from "@cocalc/util/db-schema/compute-servers";
import {
  setMachineType,
  setSpot,
  increaseBootDiskSize,
  setAccelerator,
} from "./client";
import { getServerName } from "./index";
import getLogger from "@cocalc/backend/logger";

const logger = getLogger(
  "server:compute:google-cloud:make-configuration-change",
);

export const SUPPORTED_CHANGES = [
  "ephemeral",
  "machineType",
  "spot",
  "diskSizeGb",
  "acceleratorType",
  "acceleratorCount",
  "test",
  "excludeFromSync",
  "autoRestart",
  "allowCollaboratorControl",
  "authToken",
  "proxy",
].concat(AUTOMATIC_SHUTDOWN_FIELDS);

export const RUNNING_CHANGES = [
  "ephemeral",
  "diskSizeGb",
  "autoRestart",
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
  currentConfiguration: GoogleCloudConfiguration;
  newConfiguration: GoogleCloudConfiguration;
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

  const name = await getServerName({ id });
  const zone = currentConfiguration.zone;

  if (
    (currentConfiguration.diskSizeGb ?? 10) <
    (newConfiguration.diskSizeGb ?? 10)
  ) {
    await increaseBootDiskSize({
      name,
      zone,
      wait: true,
      configuration: newConfiguration,
    });
  }

  if (currentConfiguration.machineType != newConfiguration.machineType) {
    if (state != "off") {
      throw Error(
        "compute server must be 'off' or 'deprovisioned' to change machineType",
      );
    }
    await setMachineType({
      name,
      zone,
      wait: true,
      configuration: newConfiguration,
    });
  }
  if (!!currentConfiguration.spot != !!newConfiguration.spot) {
    if (state != "off") {
      throw Error(
        "compute server must be 'off' or 'deprovisioned' to change between spot and standard",
      );
    }
    await setSpot({
      name,
      zone,
      wait: true,
      configuration: newConfiguration,
    });
  }

  if (
    currentConfiguration.acceleratorType != newConfiguration.acceleratorType ||
    currentConfiguration.acceleratorCount != newConfiguration.acceleratorCount
  ) {
    if (state != "off") {
      throw Error(
        "compute server must be 'off' or 'deprovisioned' to modify GPU configuration",
      );
    }
    await setAccelerator({
      name,
      zone,
      wait: true,
      configuration: newConfiguration,
    });
  }
}
