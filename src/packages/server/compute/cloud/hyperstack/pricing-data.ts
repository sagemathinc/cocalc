/*
Returns array of objects

{
    "flavor_name": "n1-RTX-A6000x2",
    "region_name": "CANADA-1",
    "cpu": 32,
    "ram": 119,
    "disk": 850,
    "ephemeral": 0,
    "gpu": "RTX-A6000",
    "gpu_count": 2,
    "available": 61,
    "cost_per_hour": 2.2889783300000004
}

for all VM configurations ("flavors") that hyperstack offers.

We of course include not-available options so that we can compute
the current price of any VM.

*/

import type { PurchaseOption } from "@cocalc/util/compute/cloud/hyperstack/pricing";
import type { Price } from "@cocalc/util/compute/cloud/hyperstack/api-types";
import { getFlavors, getPricebook, getStocks } from "./client";
import TTLCache from "@isaacs/ttlcache";

function getKey({ region_name, gpu, gpu_count }) {
  return `${region_name}-${gpu}-${gpu_count}`;
}

const CACHE_TIME_M = 5;
const ttlCache = new TTLCache({ ttl: CACHE_TIME_M * 60 * 1000 });

export default async function getPricingData(
  cache = true,
): Promise<PurchaseOption[]> {
  if (!cache) {
    ttlCache.delete("x");
  } else {
    if (ttlCache.has("x")) {
      return ttlCache.get("x")!;
    }
  }
  const stocks = await getStocks();
  const stockMap: { [key: string]: number } = {};
  for (const { region: region_name, models } of stocks) {
    for (const { model: gpu, configurations } of models) {
      for (const gpu_count of [1, 2, 4, 8]) {
        const key = getKey({ region_name, gpu, gpu_count });
        stockMap[key] = configurations[`${gpu_count}x`] ?? 0;
      }
    }
  }

  const prices = await getPricebook();
  const priceMap: { [name: string]: Price } = {};
  for (const price of prices) {
    priceMap[price.name] = price;
  }

  const flavorData = await getFlavors();

  const options: PurchaseOption[] = [];
  for (const { gpu, region_name, flavors } of flavorData) {
    if (!gpu) {
      // we do not bother with hyperstack for CPU only VM's.
      // !!WARNING: Also cost computation below excludes these!!
      continue;
    }
    for (const {
      name: flavor_name,
      cpu,
      ram,
      disk,
      ephemeral,
      gpu_count,
      stock_available,
    } of flavors) {
      let available = 0;
      if (stock_available && !flavor_name.toLowerCase().endsWith("k8s")) {
        // This is about availability of the GPU in the given region, but doesn't
        // distinguish between k8s and not, so is misleading in that case.
        // That's why we check stock_available above, and we always throw
        // alway the k8s one as well (we don't need it).
        available = stockMap[getKey({ region_name, gpu, gpu_count })];
      }
      let cost_per_hour;
      try {
        cost_per_hour = computeCost({
          priceMap,
          disk,
          gpu,
          gpu_count,
        });
      } catch (err) {
        cost_per_hour = `${err}`;
      }
      options.push({
        flavor_name,
        region_name,
        cpu,
        ram,
        disk,
        ephemeral,
        gpu,
        gpu_count,
        available,
        cost_per_hour,
      });
    }
  }

  ttlCache.set("x", options);
  return options;
}

// This is NOT correct for cpu only flavors.  We exclude them above!!!

// Returns cost per hour for this configuration.
function computeCost({ priceMap, disk, gpu, gpu_count }): number | string {
  return (
    Number(priceMap["Cloud-SSD"].value) * disk +
    Number(priceMap["PublicIP"].value) +
    Number(priceMap[gpu].value) * gpu_count
  );
}
