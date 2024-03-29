import type { HyperstackConfiguration } from "@cocalc/util/db-schema/compute-servers";
import type { HyperstackPriceData } from "./pricing";

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

function computeOffCost(x /*{ configuration, priceData }*/) {
  console.log("off cost TODO", x.configuration);
  // TODO -- it's supposed to be a cost for disk, but I don't know
  // what that cost is! It's definitely at least $0.01 based on
  // experiment.
  return 0.03;
}

function computeRunningCost({ configuration, priceData }) {
  // TODO -- it's supposed to be a cost for disk, but I don't know
  // what that cost is! It's definitely at least $0.01 based on
  // experiment.
  const { flavor_name, region_name } = configuration ?? {};
  for (const x of priceData) {
    if (x.flavor_name == flavor_name && x.region_name == region_name) {
      return x.cost_per_hour;
    }
  }
  throw Error(
    `no price known for flavor_name=${flavor_name}, region_name=${region_name}`,
  );
}
