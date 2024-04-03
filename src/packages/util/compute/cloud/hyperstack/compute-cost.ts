import type { HyperstackConfiguration } from "@cocalc/util/db-schema/compute-servers";
import type { HyperstackPriceData } from "./pricing";
import { optionKey, markup } from "./pricing";

// This is what we intend to use and charge for the boot disk.
export const BOOT_DISK_SIZE_GB = 50;

interface Options {
  configuration: HyperstackConfiguration;
  // output of getData from this package -- https://www.npmjs.com/package/@cocalc/gcloud-pricing-calculator
  // except that package is backend only (it caches to disk), so data is obtained via an api, then used here.
  priceData: HyperstackPriceData;
  state?: "running" | "off" | "suspended";
}

export default function computeCost({
  configuration,
  priceData,
  state = "running",
}: Options): number {
  if (priceData == null) {
    throw Error("priceData must not be null");
  }
  if (state == "off") {
    return computeOffCost({ configuration, priceData });
  } else if (state == "suspended") {
    throw Error("Hyperstack does not support suspended");
  } else if (state == "running") {
    return computeRunningCost({ configuration, priceData });
  } else {
    throw Error(`computing cost for state "${state}" not implemented`);
  }
}

function throwCostNotKnownError(configuration) {
  const { flavor_name, region_name } = configuration ?? {};
  throw Error(
    `no price known for flavor_name=${flavor_name}, region_name=${region_name}`,
  );
}

function computeVolumeCost({ configuration, priceData }): number {
  if (priceData == null) {
    throwCostNotKnownError(configuration);
  }
  const boot = BOOT_DISK_SIZE_GB * priceData.sdd_cost_per_hour;
  const data = (configuration?.diskSizeGb ?? 10) * priceData.sdd_cost_per_hour;
  return boot + data;
}

// For the cocalc integration "off" means that we 100% delete the VM
// and *ONLY* keep the associated storage volumes.
function computeOffCost({ configuration, priceData }) {
  return markup({
    cost: computeVolumeCost({ configuration, priceData }),
    priceData,
  });
}

function computeRunningCost({ configuration, priceData }) {
  const data = priceData?.options[optionKey(configuration)];
  if (data == null) {
    throwCostNotKnownError(configuration);
  }
  // data.cost_per_hour *includes* GPUs, any ephemeral storage and external ip (assume: not cpu only!)
  const cost =
    data.cost_per_hour + computeVolumeCost({ configuration, priceData });
  return markup({ cost, priceData });
}
