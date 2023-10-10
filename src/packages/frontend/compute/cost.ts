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
  if (configuration.cloud == "onprem") {
    // free for now -- but we will charge, e.g., for bandwidth and management when
    // this has a management layer
    return 0;
  }
  if (configuration.cloud != "google-cloud") {
    throw Error("cost computation only implemented for google cloud");
  }
  if (state != "running" && state != "off" && state != "suspended") {
    throw Error("state must be stable");
  }
  const priceData = await getGoogleCloudPriceData();
  return computeGoogleCloudCost({ configuration, priceData, state });
}
