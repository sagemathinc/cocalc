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
    "pd-standard": { prices: { [zone: string]: number } };
    "pd-ssd": { prices: { [zone: string]: number } };
    "pd-balanced": { prices: { [zone: string]: number } };
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
  state?: "running" | "off" | "suspended";
}

/*
Returns the cost per hour in usd of a given Google Cloud vm configuration,
given the result of getData from @cocalc/gcloud-pricing-calculator.
*/
export default function computeCost({
  configuration,
  priceData,
  state = "running",
}: Options): number {
  if (state == "off") {
    return computeDiskCost({ configuration, priceData });
  } else if (state == "suspended") {
    return computeSuspendedCost({ configuration, priceData });
  } else if (state == "running") {
    return computeRunningCost({ configuration, priceData });
  } else {
    throw Error(`computing cost for state "${state}" not implemented`);
  }
}

function computeRunningCost({ configuration, priceData }) {
  const instanceCost = computeInstanceCost({ configuration, priceData });
  const diskCost = computeDiskCost({ configuration, priceData });
  const externalIpCost = computeExternalIpCost({ configuration, priceData });
  const acceleratorCost = computeAcceleratorCost({ configuration, priceData });

  log("cost", { instanceCost, diskCost, externalIpCost, acceleratorCost });
  return instanceCost + diskCost + externalIpCost + acceleratorCost;
}

function computeInstanceCost({ configuration, priceData }) {
  const data = priceData.machineTypes[configuration.machineType];
  if (data == null) {
    throw Error(
      `unable to determine cost since machine type ${configuration.machineType} is unknown. Select a different machine type.`,
    );
  }
  const cost =
    data[configuration.spot ? "spot" : "prices"]?.[configuration.region];
  if (cost == null) {
    throw Error(
      `unable to determine cost since region pricing for machine type ${configuration.machineType} is unknown. Select a different region.`,
    );
  }
  return markup({ cost, priceData });
}

// Compute the total cost of disk for this configuration, including any markup.
function computeDiskCost({ configuration, priceData }: Options): number {
  const diskType = configuration.diskType ?? "pd-standard";
  const diskCostPerGB = priceData.disks[diskType]?.prices[configuration.region];
  log("disk cost per GB per hour", { diskCostPerGB });
  if (diskCostPerGB == null) {
    throw Error(
      `unable to determine cost since disk cost in region ${configuration.region} is unknown. Select a different region.`,
    );
  }
  const cost = diskCostPerGB * (configuration.diskSizeGb ?? 10);
  return markup({ cost, priceData });
}

function computeSuspendedCost({ configuration, priceData }: Options): number {
  const diskCost = computeDiskCost({ configuration, priceData });
  const memoryCost = computeSuspendedMemoryCost({ configuration, priceData });

  return diskCost + memoryCost;
}

function computeSuspendedMemoryCost({ configuration, priceData }) {
  // how much memory does it have?
  const data = priceData.machineTypes[configuration.machineType];
  if (data == null) {
    throw Error(
      `unable to determine cost since machine type ${configuration.machineType} is unknown. Select a different machine type.`,
    );
  }
  const { memory } = data;
  if (!memory) {
    throw Error(
      `cannot compute suspended cost without knowing memory of machine type '${configuration.machineType}'`,
    );
  }
  // Pricing / GB of RAM / month is here -- https://cloud.google.com/compute/all-pricing#suspended_vm_instances
  // It is really weird in the table, e.g., in some places it claims to be basically 0, and in Sao Paulo it is
  // 0.25/GB/month, which seems to be the highest.  Until I nail this down properly with SKU's, for cocalc
  // we will just use 0.25 + the markup.
  const cost = (memory * 0.25) / 730;
  return markup({ cost, priceData });
}

// TODO: This could change and should be in pricing data --
//     https://cloud.google.com/vpc/network-pricing#ipaddress
function computeExternalIpCost({ configuration, priceData }) {
  if (!configuration.externalIp) {
    return 0;
  }
  let cost;
  if (configuration.spot) {
    cost = 0.005;
  } else {
    cost = 0.0025;
  }
  return markup({ cost, priceData });
}

function computeAcceleratorCost({ configuration, priceData }) {
  if (!configuration.acceleratorType) {
    return 0;
  }
  // we have 1 or more GPU's:
  const acceleratorCount = configuration.acceleratorCount ?? 1;
  // sometimes google has "tesla-" in the name, sometimest they don't,
  // but our pricing data doesn't.
  const acceleratorData =
    priceData.accelerators[configuration.acceleratorType] ??
    priceData.accelerators[configuration.acceleratorType.replace("tesla-", "")];
  if (acceleratorData == null) {
    throw Error(`unknown GPU accelerator ${configuration.acceleratorType}`);
  }
  if (
    !configuration.machineType.startsWith(acceleratorData.machineType ?? "")
  ) {
    throw Error(
      `machine type for ${configuration.acceleratorType} must be ${acceleratorData.machineType}. Change the machine type.`,
    );
  }
  let costPer =
    acceleratorData[configuration.spot ? "spot" : "prices"]?.[
      configuration.zone
    ];
  log("accelerator cost per", { costPer });
  if (costPer == null) {
    throw Error(
      `GPU accelerator ${configuration.acceleratorType} not available in zone ${configuration.zone}. Select a different zone.`,
    );
  }
  return markup({ cost: costPer * acceleratorCount, priceData });
}

function markup({ cost, priceData }) {
  if (priceData.markup) {
    return cost * (1 + priceData.markup / 100.0);
  }
  return cost;
}
