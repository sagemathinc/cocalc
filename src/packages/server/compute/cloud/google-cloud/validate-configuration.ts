import type {
  GoogleCloudConfiguration,
  State,
} from "@cocalc/util/db-schema/compute-servers";
import { SUPPORTED_CHANGES } from "./make-configuration-change";
import { isEqual } from "lodash";

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
    // TODO: we will support live editing of disk size at some point.
    if (state != "off") {
      throw Error("machine must be off to change the configuration");
    }

    // state is off -- but still only some changes are supported.
    const keys = new Set(
      Object.keys(currentConfiguration).concat(
        Object.keys(newConfiguration),
      ),
    );
    for (const key of keys) {
      if (
        !isEqual(currentConfiguration[key], newConfiguration[key]) &&
        !SUPPORTED_CHANGES.includes(key)
      ) {
        throw Error(`changing ${key} is not currently supported`);
      }
    }
  }

  if (newConfiguration.machineType.startsWith("g2-")) {
    if (
      !(
        newConfiguration.acceleratorType?.startsWith("nvidia-l4") &&
        (newConfiguration.acceleratorCount ?? 0) >= 1
      )
    ) {
      // Google cloud automatically adds GPU's in cases like the above,
      // which is VERY bad and would cost us tons but users nothing!
      // Not checking for this could kill us.
      throw Error("the machine type g2- must have an L4 GPU configured");
    }
  }

  if (newConfiguration.machineType.startsWith("a2-")) {
    if (
      !(
        newConfiguration.acceleratorType?.startsWith("nvidia-a100") &&
        (newConfiguration.acceleratorCount ?? 0) >= 1
      )
    ) {
      throw Error("the machine type a2- must have an A100 GPU configured");
    }
  }
}
