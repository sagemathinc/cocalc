/*
Returns data about pricing of all VM configurations ("flavors") that hyperstack offers.

For the data structure see the types defined in

util/compute/cloud/hyperstack/pricing.ts

We of course include not-available options so that we can compute
the current price of any VM.

VERY IMPORTANT!!!  The pricebook that Hyperstack returns to us has (see [1])
two fields "value" and "original_value".   We signed a contract with Hyperstack
stating that we will not divulge the "value" field.  Thus below in creating
the version of this data that should be sent to customers, be very careful to
only access and use the "original_value" field!

[1] https://infrahub-doc.nexgencloud.com/docs/api-reference/pricebook-resources/pricebook
*/

import type {
  HyperstackPriceData,
  PurchaseOption,
} from "@cocalc/util/compute/cloud/hyperstack/pricing";
import { optionKey } from "@cocalc/util/compute/cloud/hyperstack/pricing";
import type { Price } from "@cocalc/util/compute/cloud/hyperstack/api-types";
import { getFlavors, getPricebook, getStocks } from "./client";
import TTLCache from "@isaacs/ttlcache";
import { getServerSettings } from "@cocalc/database/settings/server-settings";

function getKey({ region_name, gpu, gpu_count }) {
  return `${region_name}-${gpu}-${gpu_count}`;
}

const CACHE_TIME_M = 5;
const ttlCache = new TTLCache({ ttl: CACHE_TIME_M * 60 * 1000 });

export default async function getPricingData(
  cache = true,
): Promise<HyperstackPriceData> {
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

  const options: { [region_bar_flavor: string]: PurchaseOption } = {};
  for (const { gpu, region_name, flavors } of flavorData) {
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
      if (
        gpu &&
        stock_available &&
        !flavor_name.toLowerCase().endsWith("k8s")
      ) {
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
          cpu,
          ram,
          gpu_count,
        });
      } catch (err) {
        cost_per_hour = `${err}`;
      }
      options[optionKey({ region_name, flavor_name })] = {
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
      };
    }
  }

  const {
    compute_servers_markup_percentage: global_markup,
    hyperstack_compute_servers_markup_percentage: hyperstack_markup,
  } = await getServerSettings();
  const markup = hyperstack_markup
    ? parseFloat(hyperstack_markup)
    : global_markup;
  const external_ip_cost_per_hour = Number(priceMap["PublicIP"].original_value);
  const ssd_cost_per_hour = Number(priceMap["Cloud-SSD"].original_value);
  const x = { options, markup, external_ip_cost_per_hour, ssd_cost_per_hour };

  ttlCache.set("x", x);
  return x;
}

// Returns cost per hour for this configuration.
function computeCost({
  priceMap,
  disk,
  gpu,
  cpu,
  ram,
  gpu_count,
}): number | string {
  let cost =
    Number(priceMap["Cloud-SSD"].original_value) * disk +
    Number(priceMap["PublicIP"].original_value);
  if (gpu) {
    // for machines with GPU's, the cost seems to be the internal disk (which we do not use at all)
    // plus the cost of an ip address, plus the gpu cost.
    cost += Number(priceMap[gpu].original_value) * gpu_count;
  } else {
    // for NON-GPU machines (cpu only) the cost is a function of the number of cpu's and the amount of ram.
    cost +=
      Number(priceMap["vCPU (cpu-only-flavors)"].original_value) * cpu +
      Number(priceMap["RAM (cpu-only-flavors)"].original_value) * ram;
  }
  return cost;
}
