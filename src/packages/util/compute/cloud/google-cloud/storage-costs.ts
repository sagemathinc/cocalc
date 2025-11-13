/*
Estimating Google Cloud storage costs.
*/

import type { CloudFilesystemMetric } from "@cocalc/util/db-schema/cloud-filesystems";
import type { GoogleCloudData } from "@cocalc/util/compute/cloud/google-cloud/compute-cost";
import { GOOGLE_REGION_PREFIX_TO_LOCATION } from "@cocalc/util/db-schema/cloud-filesystems";
import { capitalize } from "@cocalc/util/misc";
import { commas, human_readable_size } from "@cocalc/util/misc";

const MS_IN_MONTH = 730 * 60 * 60 * 1000;
const GB = 1024 * 1024 * 1024;

interface Options {
  metrics: CloudFilesystemMetric[];
  priceData: GoogleCloudData;
}

export function estimateCost_bytes_used({ metrics, priceData }: Options): {
  cost: number[];
  rate_per_GB_per_month: number;
} {
  let cost: number[] = [0];
  if (metrics.length == 0) {
    return { cost, rate_per_GB_per_month: 0 };
  }
  const { bucket_location, bucket_storage_class } = metrics[0];
  const rate_per_GB_per_month = getAtRestPrice({
    priceData,
    bucket_storage_class,
    bucket_location,
  });
  const rate_per_byte_per_ms = rate_per_GB_per_month / MS_IN_MONTH / GB;
  let s = 0;
  for (let i = 1; i < metrics.length; i++) {
    const avg_bytes_used =
      (metrics[i].bytes_used + metrics[i - 1].bytes_used) / 2;
    const ms = metrics[i].timestamp - metrics[i - 1].timestamp;
    s += avg_bytes_used * rate_per_byte_per_ms * ms;
    cost.push(s);
  }
  return { cost, rate_per_GB_per_month };
}

// return at rest price per GB per month
function getAtRestPrice({ priceData, bucket_storage_class, bucket_location }) {
  const cls = bucket_storage_class.includes("autoclass")
    ? "Standard"
    : capitalize(bucket_storage_class);
  const { atRest } = priceData.storage;
  if (bucket_location.includes("-")) {
    return atRest.regions[bucket_location][cls];
  } else {
    return atRest.multiRegions[bucket_location][cls];
  }
}

function sortByServer(metrics: CloudFilesystemMetric[]) {
  const byServer: { [id: number]: CloudFilesystemMetric[] } = {};
  for (const metric of metrics) {
    const id = metric.compute_server_id;
    if (byServer[id] == null) {
      byServer[id] = [metric];
    } else {
      byServer[id].push(metric);
    }
  }
  return byServer;
}

export function estimateCost({
  field,
  metrics,
  priceData,
}: {
  metrics: CloudFilesystemMetric[];
  priceData: GoogleCloudData;
  field: string;
}): {
  cost_min: number;
  cost_max: number;
  total: number;
  desc: string;
} {
  if (field == "bytes_put") {
    return estimateCost_bytes_put({ metrics, priceData });
  } else if (field == "bytes_get") {
    return estimateCost_bytes_get({ metrics, priceData });
  } else if (field == "objects_put") {
    return estimateCost_objects_put({ metrics, priceData });
  } else if (field == "objects_get") {
    return estimateCost_objects_get({ metrics, priceData });
  }
  return { cost_min: 0, cost_max: 0, total: 0, desc: "" };
}

function estimateCost_bytes_put({ metrics, priceData }: Options): {
  cost_min: number;
  cost_max: number;
  total: number;
  desc: string;
} {
  const x = estimateCost_field({
    metrics,
    priceData,
    field: "bytes_put",
    getPrice: (opts) => {
      const { min, max } = getUploadPrice(opts);
      return { min: min / GB, max: max / GB };
    },
  });
  const desc = `to upload ${human_readable_size(x.total)} data`;
  return { ...x, desc };
}

function estimateCost_bytes_get({ metrics, priceData }: Options): {
  cost_min: number;
  cost_max: number;
  total: number;
  desc: string;
} {
  const x = estimateCost_field({
    metrics,
    priceData,
    field: "bytes_get",
    getPrice: (opts) => {
      const { min, max } = getDownloadPrice(opts);
      return { min: min / GB, max: max / GB };
    },
  });
  const desc = `to download ${human_readable_size(x.total)} data`;
  return { ...x, desc };
}

function estimateCost_objects_put({ metrics, priceData }: Options): {
  cost_min: number;
  cost_max: number;
  total: number;
  desc: string;
} {
  const x = estimateCost_field({
    metrics,
    priceData,
    field: "objects_put",
    getPrice: (opts) => {
      const cost = getClassA1000Price(opts);
      return { min: cost / 1000, max: cost / 1000 };
    },
  });
  const desc = `to upload ${commas(x.total)} objects (class A operations)`;
  return { ...x, desc };
}

function estimateCost_objects_get({ metrics, priceData }: Options): {
  cost_min: number;
  cost_max: number;
  total: number;
  desc: string;
} {
  const x = estimateCost_field({
    metrics,
    priceData,
    field: "objects_get",
    getPrice: (opts) => {
      const cost = getClassB1000Price(opts);
      return { min: cost / 1000, max: cost / 1000 };
    },
  });
  const desc = `to download ${commas(x.total)} objects (class B operations)`;
  return { ...x, desc };
}

function estimateCost_field({ metrics, priceData, field, getPrice }): {
  cost_min: number;
  cost_max: number;
  total: number;
} {
  if (metrics.length == 0) {
    return { cost_min: 0, cost_max: 0, total: 0 };
  }
  // divide up by compute server id
  const byServer = sortByServer(metrics);
  // compute the data
  let cost_min = 0,
    cost_max = 0,
    total = 0;
  for (const id in byServer) {
    const metrics = byServer[id];
    const { bucket_location, compute_server_location, bucket_storage_class } =
      metrics[0];
    const { min, max } = getPrice({
      priceData,
      bucket_location,
      bucket_storage_class,
      compute_server_location,
    });
    let value = 0;
    let process_uptime = 0;
    for (let i = 1; i < metrics.length; i++) {
      if (metrics[i].process_uptime > process_uptime) {
        value += (metrics[i][field] ?? 0) - (metrics[i - 1][field] ?? 0);
      }
      process_uptime = metrics[i].process_uptime;
    }
    total += value;
    cost_min += value * min;
    cost_max += value * max;
  }
  return { cost_min, cost_max, total };
}

// price per GB to upload data
function getUploadPrice({
  priceData,
  bucket_location,
  compute_server_location,
}): { min: number; max: number } {
  if (compute_server_location == "world") {
    return { min: 0, max: 0 };
  }
  if (compute_server_location == "unknown" || !compute_server_location) {
    return { min: 0, max: 0 };
  }
  if (bucket_location == compute_server_location) {
    return { min: 0, max: 0 };
  }
  const bucketLoc =
    GOOGLE_REGION_PREFIX_TO_LOCATION[bucket_location.split("-")[0]];
  const computeLoc =
    GOOGLE_REGION_PREFIX_TO_LOCATION[compute_server_location.split("-")[0]];
  const s =
    priceData.storage.dataTransferInsideGoogleCloud[computeLoc][bucketLoc];
  return { min: s, max: s };
}

function getDownloadPrice({
  priceData,
  bucket_location,
  compute_server_location,
}): { min: number; max: number } {
  if (compute_server_location == "world") {
    return { min: 0.12, max: 0.12 };
  }
  if (compute_server_location == "unknown" || !compute_server_location) {
    // not in google cloud -- it's 0.12 or more in some edge cases.
    return { min: 0.12, max: 0.23 };
  }
  if (bucket_location == compute_server_location) {
    return { min: 0, max: 0 };
  }
  const bucketLoc =
    GOOGLE_REGION_PREFIX_TO_LOCATION[bucket_location.split("-")[0]];
  const computeLoc =
    GOOGLE_REGION_PREFIX_TO_LOCATION[compute_server_location.split("-")[0]];
  const s =
    priceData.storage.dataTransferInsideGoogleCloud[computeLoc][bucketLoc];
  return { min: s, max: s };
}

function getClassA1000Price({
  priceData,
  bucket_location,
  bucket_storage_class,
}): number {
  let cls;
  if (bucket_storage_class.includes("auto")) {
    cls = "standard";
  } else {
    cls = bucket_storage_class;
  }
  if (bucket_location.includes("-")) {
    // single region
    return priceData.storage.singleRegionOperations[cls].classA1000;
  } else {
    return priceData.storage.multiRegionOperations[cls].classA1000;
  }
}

function getClassB1000Price({
  priceData,
  bucket_location,
  bucket_storage_class,
}): number {
  let cls;
  if (bucket_storage_class.includes("auto")) {
    cls = "standard";
  } else {
    cls = bucket_storage_class;
  }
  if (bucket_location.includes("-")) {
    // single region
    return priceData.storage.singleRegionOperations[cls].classB1000;
  } else {
    return priceData.storage.multiRegionOperations[cls].classB1000;
  }
}
