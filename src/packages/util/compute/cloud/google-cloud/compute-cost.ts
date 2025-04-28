import type { GoogleCloudConfiguration } from "@cocalc/util/db-schema/compute-servers";
import { DNS_COST_PER_HOUR } from "@cocalc/util/compute/dns";

// import debug from "debug";
//const log = debug("cocalc:util:compute-cost");
const log = (..._args) => {};

// copy-pasted from my @cocalc/gcloud-pricing-calculator package to help with sanity in code below.

interface PriceData {
  prices?: { [region: string]: number };
  spot?: { [region: string]: number };
  vcpu?: number;
  memory?: number;
  count?: number; // for gpu's only
  max?: number; // for gpu's only
  machineType?: string | { [count: number]: string[] }; // for gpu's only
}

interface ZoneData {
  machineTypes: string; // ['e2','n1','n2', 't2d' ... ] -- array of machine type prefixes
  location: string; // description of where it is
  lowC02: boolean; // if true, low c02 emissions
  gpus: boolean; // if true, has gpus
}

export interface BucketPricing {
  Standard?: number;
  Nearline?: number;
  Coldline?: number;
  Archive?: number;
}

export type GoogleWorldLocations =
  | "APAC"
  | "Europe"
  | "Middle East"
  | "North America"
  | "South Africa"
  | "South America";

interface GoogleWorldPrices {
  APAC: number;
  Europe: number;
  "Middle East": number;
  "North America": number;
  "South Africa": number;
  "South America": number;
}

export interface GoogleCloudData {
  machineTypes: { [machineType: string]: PriceData };
  disks: {
    "pd-standard": { prices: { [zone: string]: number } };
    "pd-ssd": { prices: { [zone: string]: number } };
    "pd-balanced": { prices: { [zone: string]: number } };
    "hyperdisk-balanced-capacity": { prices: { [zone: string]: number } };
    "hyperdisk-balanced-iops": { prices: { [zone: string]: number } };
    "hyperdisk-balanced-throughput": { prices: { [zone: string]: number } };
  };
  accelerators: { [acceleratorType: string]: PriceData };
  zones: { [zone: string]: ZoneData };
  // markup percentage: optionally include markup to always increase price by this amount,
  // e.g., if markup is 42, then price will be multiplied by 1.42.
  markup?: number;
  storage: {
    atRest: {
      dualRegions: { [region: string]: BucketPricing };
      multiRegions: {
        asia: BucketPricing;
        eu: BucketPricing;
        us: BucketPricing;
      };
      regions: {
        [region: string]: BucketPricing;
      };
    };
    dataTransferInsideGoogleCloud: {
      APAC: GoogleWorldPrices;
      Europe: GoogleWorldPrices;
      "Middle East": GoogleWorldPrices;
      "North America": GoogleWorldPrices;
      "South Africa": GoogleWorldPrices;
      "South America": GoogleWorldPrices;
    };
    dataTransferOutsideGoogleCloud: {
      worldwide: number;
      china: number;
      australia: number;
    };
    interRegionReplication: {
      asia: number;
      eu: number;
      us: number;
    };
    retrieval: {
      standard: number;
      nearline: number;
      coldline: number;
      archive: number;
    };
    singleRegionOperations: {
      standard: { classA1000: number; classB1000: number };
      nearline: { classA1000: number; classB1000: number };
      coldline: { classA1000: number; classB1000: number };
      archive: { classA1000: number; classB1000: number };
    };
  };
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
    return computeOffCost({ configuration, priceData });
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
  const dnsCost = computeDnsCost({ configuration });
  log("cost", {
    instanceCost,
    diskCost,
    externalIpCost,
    acceleratorCost,
    dnsCost,
  });
  return instanceCost + diskCost + externalIpCost + acceleratorCost + dnsCost;
}

function computeDnsCost({ configuration }) {
  return configuration.dns ? DNS_COST_PER_HOUR : 0;
}

export function computeInstanceCost({ configuration, priceData }) {
  const data = priceData.machineTypes[configuration.machineType];
  if (data == null) {
    throw Error(
      `unable to determine cost since machine type ${configuration.machineType} is unknown. Select a different machine type.`,
    );
  }
  const cost =
    data[configuration.spot ? "spot" : "prices"]?.[configuration.region];
  if (cost == null) {
    if (configuration.spot && Object.keys(data["spot"]).length == 0) {
      throw Error(
        `spot instance pricing for ${configuration.machineType} is not available`,
      );
    }
    throw Error(
      `unable to determine cost since machine type ${configuration.machineType} is not available in the region '${configuration.region}'. Select a different region.`,
    );
  }
  return markup({ cost, priceData });
}

// Compute the total cost of disk for this configuration, including any markup.

// for now this is the only thing we support
export const DEFAULT_HYPERDISK_BALANCED_IOPS = 3000;
export const DEFAULT_HYPERDISK_BALANCED_THROUGHPUT = 140;

export function hyperdiskCostParams({ region, priceData }): {
  capacity: number;
  iops: number;
  throughput: number;
} {
  const diskType = "hyperdisk-balanced";
  const capacity =
    priceData.disks["hyperdisk-balanced-capacity"]?.prices[region];
  if (!capacity) {
    throw Error(
      `Unable to determine ${diskType} capacity pricing in ${region}. Select a different region.`,
    );
  }
  const iops = priceData.disks["hyperdisk-balanced-iops"]?.prices[region];
  if (!iops) {
    throw Error(
      `Unable to determine ${diskType} iops pricing in ${region}. Select a different region.`,
    );
  }
  const throughput =
    priceData.disks["hyperdisk-balanced-throughput"]?.prices[region];
  if (!throughput) {
    throw Error(
      `Unable to determine ${diskType} throughput pricing in ${region}. Select a different region.`,
    );
  }
  return { capacity, iops, throughput };
}

export function computeDiskCost({ configuration, priceData }: Options): number {
  const diskType = configuration.diskType ?? "pd-standard";
  let cost;
  if (diskType == "hyperdisk-balanced") {
    // per hour pricing for hyperdisks is NOT "per GB". The pricing is per hour, but the
    // formula is not as simple as "per GB", so we compute the cost per hour via
    // the more complicated formula here.
    const { capacity, iops, throughput } = hyperdiskCostParams({
      priceData,
      region: configuration.region,
    });
    cost =
      (configuration.diskSizeGb ?? 10) * capacity +
      (configuration.hyperdiskBalancedIops ?? DEFAULT_HYPERDISK_BALANCED_IOPS) *
        iops +
      (configuration.hyperdiskBalancedThroughput ??
        DEFAULT_HYPERDISK_BALANCED_THROUGHPUT) *
        throughput;
  } else {
    // per hour pricing for the rest of the disks is just "per GB" via the formula here.
    const diskCostPerGB =
      priceData.disks[diskType]?.prices[configuration.region];
    log("disk cost per GB per hour", { diskCostPerGB });
    if (!diskCostPerGB) {
      throw Error(
        `unable to determine cost since disk cost in region ${configuration.region} is unknown. Select a different region.`,
      );
    }
    cost = diskCostPerGB * (configuration.diskSizeGb ?? 10);
  }
  return markup({ cost, priceData });
}

export function computeOffCost({ configuration, priceData }: Options): number {
  const diskCost = computeDiskCost({ configuration, priceData });
  const dnsCost = computeDnsCost({ configuration });

  return diskCost + dnsCost;
}

export function computeSuspendedCost({
  configuration,
  priceData,
}: Options): number {
  const diskCost = computeDiskCost({ configuration, priceData });
  const memoryCost = computeSuspendedMemoryCost({ configuration, priceData });
  const dnsCost = computeDnsCost({ configuration });

  return diskCost + memoryCost + dnsCost;
}

export function computeSuspendedMemoryCost({ configuration, priceData }) {
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
export const EXTERNAL_IP_COST = {
  standard: 0.005,
  spot: 0.0025,
};

export function computeExternalIpCost({ configuration, priceData }) {
  if (!configuration.externalIp) {
    return 0;
  }
  let cost;
  if (configuration.spot) {
    cost = EXTERNAL_IP_COST.spot;
  } else {
    cost = EXTERNAL_IP_COST.standard;
  }
  return markup({ cost, priceData });
}

export function computeAcceleratorCost({ configuration, priceData }) {
  if (!configuration.acceleratorType) {
    return 0;
  }
  // we have 1 or more GPUs:
  const acceleratorCount = configuration.acceleratorCount ?? 1;
  // sometimes google has "tesla-" in the name, sometimes they don't,
  // but our pricing data doesn't.
  const acceleratorData =
    priceData.accelerators[configuration.acceleratorType] ??
    priceData.accelerators[configuration.acceleratorType.replace("tesla-", "")];
  if (acceleratorData == null) {
    throw Error(`unknown GPU accelerator ${configuration.acceleratorType}`);
  }

  if (
    typeof acceleratorData.machineType == "string" &&
    !configuration.machineType.startsWith(acceleratorData.machineType)
  ) {
    throw Error(
      `machine type for ${configuration.acceleratorType} must be ${acceleratorData.machineType}. Change the machine type.`,
    );
  }
  if (typeof acceleratorData.machineType == "object") {
    let v: string[] = acceleratorData.machineType[acceleratorCount];
    if (v == null) {
      throw Error(`invalid number of GPUs`);
    }
    if (!v.includes(configuration.machineType)) {
      throw Error(
        `machine type for ${
          configuration.acceleratorType
        } with count ${acceleratorCount} must be one of ${v.join(", ")}`,
      );
    }
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

export const DATA_TRANSFER_OUT_COST_PER_GiB = 0.15;
export function computeNetworkCost(dataTransferOutGiB: number): number {
  // The worst possible case is 0.15
  // https://cloud.google.com/vpc/network-pricing
  // We might come up with a most sophisticated and affordable model if we
  // can figure it out; however, it seems possibly extremely difficult.
  // For now our solution will be to charge a flat 0.15 fee, and don't
  // include any markup.
  const cost = dataTransferOutGiB * DATA_TRANSFER_OUT_COST_PER_GiB;
  return cost;
}

export function markup({ cost, priceData }) {
  if (priceData.markup) {
    return cost * (1 + priceData.markup / 100.0);
  }
  return cost;
}
