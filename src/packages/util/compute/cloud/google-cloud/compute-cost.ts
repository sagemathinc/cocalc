import type { GoogleCloudConfiguration } from "@cocalc/util/db-schema/compute-servers";
import debug from "debug";

const log = debug("cocalc:util:compute-cost");

interface Options {
  configuration: GoogleCloudConfiguration;
  // output of getData from this package -- https://www.npmjs.com/package/@cocalc/gcloud-pricing-calculator
  // except that package is backend only (it caches to disk), so data is obtained via an api, then used here.
  priceData;
}

/*
Returns the cost per hour in usd of a given Google Cloud vm configuration,
given the result of getData from @cocalc/gcloud-pricing-calculator.
*/
export default function computeCost({
  configuration,
  priceData,
}: Options): Promise<number> {
  const data = priceData[configuration.machineType];
  if (data == null) {
    throw Error(
      `unable to determine cost since machine type ${configuration.machineType} is unknown`,
    );
  }
  const vmCost =
    data[configuration.spot ? "spot" : "prices"]?.[configuration.region];
  log("vm cost", { vmCost });
  if (vmCost == null) {
    throw Error(
      `unable to determine cost since region pricing for machine type ${configuration.machineType} is unknown`,
    );
  }

  const diskCost = priceData["disk-standard"]?.prices[configuration.region];
  log("disk cost per GB", { diskCost });
  if (diskCost == null) {
    throw Error(
      `unable to determine cost since disk cost in region ${configuration.region} is unknown`,
    );
  }

  let acceleratorCost;
  if (configuration.acceleratorType) {
    // we have 1 or more GPU's:
    const acceleratorCount = configuration.acceleratorCount ?? 1;
    // sometimes google has "tesla-" in the name, sometimest they don't,
    // but our pricing data doesn't.
    const acceleratorData =
      priceData[configuration.acceleratorType] ??
      priceData[configuration.acceleratorType.replace("tesla-", "")];
    if (acceleratorData == null) {
      throw Error(`unknown GPU accelerator ${configuration.acceleratorType}`);
    }
    const costPer =
      acceleratorData[configuration.spot ? "spot" : "prices"]?.[
        configuration.region
      ];
    log("accelerator cost per", { costPer });
    if (costPer == null) {
      throw Error(
        `GPU accelerator ${configuration.acceleratorType} not available in region ${configuration.region}`,
      );
    }
    acceleratorCost = costPer * acceleratorCount;
  } else {
    acceleratorCost = 0;
  }

  const total =
    diskCost * (configuration.diskSizeGb ?? 10) + vmCost + acceleratorCost;
  log("cost", { total });
  return total;
}
