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
  noMarkup?: boolean;
  state?: "running" | "off" | "suspended";
}

/*
Returns the cost per hour in usd of a given Google Cloud vm configuration,
given the result of getData from @cocalc/gcloud-pricing-calculator.
*/
export default function computeCost({
  configuration,
  priceData,
  noMarkup,
  state = "running",
}: Options): number {
  if (state == "off") {
    return computeDiskCost({ configuration, priceData, noMarkup });
  } else if (state == "suspended") {
    return computeSuspendedCost({ configuration, priceData, noMarkup });
  } else if (state == "running") {
    return computeRunningCost({ configuration, priceData, noMarkup });
  } else {
    throw Error(`computing cost for state "${state}" not implemented`);
  }
}

function computeRunningCost({ configuration, priceData, noMarkup }) {
  const data = priceData.machineTypes[configuration.machineType];
  if (data == null) {
    throw Error(
      `unable to determine cost since machine type ${configuration.machineType} is unknown. Select a different machine type.`,
    );
  }
  const vmCost =
    data[configuration.spot ? "spot" : "prices"]?.[configuration.region];
  log("vm cost", { vmCost });
  if (vmCost == null) {
    throw Error(
      `unable to determine cost since region pricing for machine type ${configuration.machineType} is unknown. Select a different region.`,
    );
  }

  const diskCost = computeDiskCost({ configuration, priceData });
  const externalIpCost = computeExternalIpCost({ configuration });

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
    acceleratorCost = costPer * acceleratorCount;
  } else {
    acceleratorCost = 0;
  }

  let computeCost = vmCost + acceleratorCost;
  if (priceData.markup && !noMarkup) {
    computeCost *= 1 + priceData.markup / 100.0;
  }

  const total = diskCost + computeCost + externalIpCost;
  log("cost", { total, vmCost, acceleratorCost, diskCost });
  return total;
}

// Compute the total cost of disk for this configuration, including any markup.
function computeDiskCost({
  configuration,
  priceData,
  noMarkup,
}: Options): number {
  const diskType = configuration.diskType ?? "pd-standard";
  const diskCostPerGB = priceData.disks[diskType]?.prices[configuration.region];
  log("disk cost per GB per hour", { diskCostPerGB });
  if (diskCostPerGB == null) {
    throw Error(
      `unable to determine cost since disk cost in region ${configuration.region} is unknown. Select a different region.`,
    );
  }
  let diskCost = diskCostPerGB * (configuration.diskSizeGb ?? 10);
  if (priceData.markup && !noMarkup) {
    diskCost *= 1 + priceData.markup / 100.0;
  }
  return diskCost;
}

function computeSuspendedCost({
  configuration,
  priceData,
  noMarkup,
}: Options): number {
  const diskCost = computeDiskCost({ configuration, priceData, noMarkup });
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
  const memoryCost = (memory * 0.25) / 730;

  // NOTE: we do not have any static ip support -- just ephemeral external ip's that go away on suspend.
  // static unused ip's are VERY expensive when suspended, so be sure to update this if we ever have those.
  // I don't plan to have them though -- it doesn't make sense for our use cases.

  let suspendCost = diskCost + memoryCost;

  if (priceData.markup && !noMarkup) {
    suspendCost *= 1 + priceData.markup / 100.0;
  }
  return suspendCost;
}

// TODO: This could change and should be in pricing data --
//     https://cloud.google.com/vpc/network-pricing#ipaddress
function computeExternalIpCost({ configuration }) {
  if (!configuration.externalIp) {
    return 0;
  }
  if (configuration.spot) {
    return 0.004;
  } else {
    return 0.002;
  }
}
