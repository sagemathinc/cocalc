/*
Compute cost per hour of a configuration in a given state.
*/

import type {
  State,
  Configuration,
} from "@cocalc/util/db-schema/compute-servers";
import { getGoogleCloudPriceData } from "./api";
import computeGoogleCloudCost from "@cocalc/util/compute/cloud/google-cloud/compute-cost";

export default async function costPerHour({
  configuration,
  state,
}: {
  configuration: Configuration;
  state: State;
}): Promise<number> {
  if (state == "deprovisioned") {
    // always a cost of 0 in this state
    return 0;
  }
  if (configuration.cloud != "google-cloud") {
    throw Error("cost computation only implemented for google cloud");
  }
  const priceData = await getGoogleCloudPriceData();
  if (state == "running") {
    return computeGoogleCloudCost({ configuration, priceData });
  } else {
    throw Error(`cost computation for state '${state}' not implemented`);
  }
}
