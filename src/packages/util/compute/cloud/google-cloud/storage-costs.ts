/*
Estimating Google Cloud storage costs.
*/

import type { CloudFilesystemMetric } from "@cocalc/util/db-schema/cloud-filesystems";
import type { GoogleCloudData } from "@cocalc/util/compute/cloud/google-cloud/compute-cost";
import { capitalize } from "@cocalc/util/misc";

const MS_IN_MONTH = 730 * 60 * 60 * 1000;
const GB = 1024 * 1024 * 1024;

export function estimateAtRestCost({
  metrics,
  priceData,
}: {
  metrics: CloudFilesystemMetric[];
  priceData: GoogleCloudData;
}): { cost: number[]; rate_per_GB_per_month: number } {
  let cost: number[] = [0];
  const { bucket_location } = metrics[0];
  const { bucket_storage_class } = metrics[0];
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
