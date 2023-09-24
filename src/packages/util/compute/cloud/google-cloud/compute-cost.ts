import type { GoogleCloudConfiguration } from "@cocalc/util/db-schema/compute-servers";
import debug from "debug";

const log = debug("cocalc:util:compute-cost");

// copy-pasted from my @cocalc/gcloud-pricing-calculator package to help with sanity in code below.

interface PriceData {
  prices?: { [region: string]: number };
  spot?: { [region: string]: number };
  vcpu?: number;
  memory?: number;
  count?: number; // for gpu's only
  max?: number; // for gpu's only
  machineType?: string; // for gpu's only
}

interface ZoneData {
  machineTypes: string; // ['e2','n1','n2', 't2d' ... ] -- array of machine type prefixes
  location: string; // description of where it is
  lowC02: boolean; // if true, low c02 emissions
  gpus: boolean; // if true, has gpus
}

export interface GoogleCloudData {
  machineTypes: { [machineType: string]: PriceData };
  disks: {
    standard: { prices: { [zone: string]: number } };
    ssd: { prices: { [zone: string]: number } };
  };
  accelerators: { [acceleratorType: string]: PriceData };
  zones: { [zone: string]: ZoneData };
  // markup percentage: optionally include markup to always increase price by this amount,
  // e.g., if markup is 42, then price will be multiplied by 1.42.
  markup?: number;
}

interface Options {
  configuration: GoogleCloudConfiguration;
  // output of getData from this package -- https://www.npmjs.com/package/@cocalc/gcloud-pricing-calculator
  // except that package is backend only (it caches to disk), so data is obtained via an api, then used here.
  priceData: GoogleCloudData;
}

/*
Returns the cost per hour in usd of a given Google Cloud vm configuration,
given the result of getData from @cocalc/gcloud-pricing-calculator.
*/
export default function computeCost({
  configuration,
  priceData,
}: Options): number {
  const data = priceData.machineTypes[configuration.machineType];
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

  const diskCost = priceData.disks["standard"]?.prices[configuration.region];
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
      priceData.accelerators[configuration.acceleratorType] ??
      priceData.accelerators[
        configuration.acceleratorType.replace("tesla-", "")
      ];
    if (acceleratorData == null) {
      throw Error(`unknown GPU accelerator ${configuration.acceleratorType}`);
    }
    if (
      !configuration.machineType.startsWith(acceleratorData.machineType ?? "")
    ) {
      throw Error(
        `machine type for ${configuration.acceleratorType} must be ${acceleratorData.machineType}`,
      );
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

  if (priceData.markup) {
    return total * (1 + priceData.markup / 100.0);
  } else {
    return total;
  }
}
