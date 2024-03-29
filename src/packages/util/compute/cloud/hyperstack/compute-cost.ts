import type { HyperstackConfiguration } from "@cocalc/util/db-schema/compute-servers";
import type { HyperstackPriceData } from "./pricing";
import { optionKey, markup } from "./pricing";

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
  const data = priceData?.options[optionKey(configuration)];
  if (data != null) {
    return markup({ cost: data.cost_per_hour, priceData });
  }
  const { flavor_name, region_name } = configuration ?? {};
  throw Error(
    `no price known for flavor_name=${flavor_name}, region_name=${region_name}`,
  );
}
