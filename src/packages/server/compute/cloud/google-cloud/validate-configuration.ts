import type {
  GoogleCloudConfiguration,
  State,
} from "@cocalc/util/db-schema/compute-servers";
import {
  RUNNING_CHANGES,
  SUPPORTED_CHANGES,
} from "./make-configuration-change";
import { changedKeys } from "@cocalc/server/compute/util";
import { getArchitecture } from "./images";

export async function validateConfigurationChange({
  state = "deprovisioned",
  currentConfiguration,
  newConfiguration,
}: {
  state: State;
  currentConfiguration: GoogleCloudConfiguration;
  newConfiguration: GoogleCloudConfiguration;
}) {
  // These checks below for deleted state are *critical*.  Otherwise, we could easily end up
  // with multiple VM's left running in multiple zones/rgions (on our dime) and data loss.
  // Instead don't allow such a change.  Also, of course, frontend UI will have the same constraint.
  if (state != "deprovisioned") {
    if (currentConfiguration.region != newConfiguration.region) {
      throw Error(
        `cannot change the region from "${currentConfiguration.region}" unless in the 'deprovisioned' state`,
      );
    }
    if (currentConfiguration.zone != newConfiguration.zone) {
      throw Error(
        `cannot change from "${currentConfiguration.zone}" the zone unless in the 'deprovisioned' state`,
      );
    }
    if (currentConfiguration.diskType != newConfiguration.diskType) {
      throw Error(
        `cannot change disk type unless in the 'deprovisioned' state`,
      );
    }
    if (currentConfiguration.test != newConfiguration.test) {
      throw Error(
        `cannot change test type unless in the 'deprovisioned' state`,
      );
    }
    if (
      (newConfiguration.diskSizeGb ?? 10) <
      (currentConfiguration.diskSizeGb ?? 10)
    ) {
      throw Error(`cannot shrink disk unless in the 'deprovisioned' state`);
    }

    // state is off -- but still only some changes are supported.
    const changed = changedKeys(currentConfiguration, newConfiguration);

    if (changed.has("dns")) {
      // changing DNS is allowed in all states.
      changed.delete("dns");
    }

    if (state != "off" && changed.size > 0) {
      for (const key of changed) {
        if (!RUNNING_CHANGES.includes(key)) {
          if (!SUPPORTED_CHANGES.includes(key)) {
            throw Error(
              `changing '${key}' state is not supported unless server is deprovisioned`,
            );
          } else {
            throw Error(
              `changing '${key}' state is not supported unless server is off`,
            );
          }
        }
      }
    }

    for (const key of changed) {
      if (!SUPPORTED_CHANGES.includes(key)) {
        throw Error(
          `changing ${key} is not supported unless server is deprovisioned`,
        );
      }
    }
    // You can't go between having and not having a GPU, because the disk image
    // itself has to change
    // and that isn't possible.
    if (
      !!currentConfiguration.acceleratorType !=
        !!newConfiguration.acceleratorType ||
      !!currentConfiguration.acceleratorCount !=
        !!newConfiguration.acceleratorCount
    ) {
      throw Error(
        "cannot change between having and not having a GPU unless in the 'deprovisioned' state",
      );
    }

    if (
      getArchitecture(currentConfiguration.machineType) !=
      getArchitecture(newConfiguration.machineType)
    ) {
      throw Error(
        "cannot change the the architecture (between x86 and arm64) unless in the 'deprovisioned' state",
      );
    }
  }

  if (newConfiguration.machineType.startsWith("g2-")) {
    if (
      !(
        newConfiguration.acceleratorType?.startsWith("nvidia-l4") &&
        (newConfiguration.acceleratorCount ?? 0) >= 1
      )
    ) {
      // Google cloud automatically adds GPUs in cases like the above,
      // which is VERY bad and would cost us tons but users nothing!
      // Not checking for this could kill us.
      throw Error("the machine type g2- must have an L4 GPU configured");
    }
  }

  if (newConfiguration.machineType.startsWith("a2-")) {
    if (
      !(
        ["nvidia-tesla-a100", "nvidia-a100-80gb"].includes(
          newConfiguration.acceleratorType ?? "",
        ) && (newConfiguration.acceleratorCount ?? 0) >= 1
      )
    ) {
      throw Error("the machine type a2- must have an A100 GPU configured");
    }
  }
}
