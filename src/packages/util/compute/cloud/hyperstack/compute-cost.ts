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

function costNotKnown(configuration) {
  const { flavor_name, region_name } = configuration ?? {};
  throw Error(
    `no price known for flavor_name=${flavor_name}, region_name=${region_name}`,
  );
}

function computeOffCost({ configuration, priceData }) {
  const data = priceData?.options[optionKey(configuration)];
  if (data == null) {
    costNotKnown(configuration);
  }
  // TODO! What happens to data.ephemeral disk? Right now they just delete it!
  // They tell you to copy it to a normal volume at https://infrahub-doc.nexgencloud.com/docs/hyperstack/
  // so we need to make this clear and/or implement automating this!
  const cost =
    priceData.external_ip_cost_per_hour +
    data.disk * priceData.sdd_cost_per_hour;
  return markup({ cost, priceData });
}

function computeRunningCost({ configuration, priceData }) {
  const data = priceData?.options[optionKey(configuration)];
  if (data == null) {
    costNotKnown(configuration);
  }
  const cost = data.cost_per_hour; // this *includes* storage and external ip
  return markup({ cost, priceData });
}
