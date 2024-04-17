/*
For hyperstack the flavor_name is a string of the form

    [n1|n2|n3]-[RTX-A6000|A100|H100|L40|...]x[1,2,4,8,10][-NVLink-v2|-NVLink-K8s|-K8s|-a]

We define this as

    [model]x[count]

where the count may include -NVLink-v2 or -a, i.e., count is not always just a number.

The code in this module is for parsing and manipulating this flavor string.

The actual flavors are

  Object.values(priceData.options).map((x)=>x.flavor_name)

and are a small subset of all possibilities according to
the above format, of course.

NOTES:

- Presumably the actual flavors will just grow over time in unpredictable ways.
  So below we make a list of known/tested data.  We could explicitly list new things
  that pop up via the API as "advanced".

- I have no clue what the [n1|n2|n3]- part of the flavor actually "means".  It is unique
  in a region.  It doesn't determine the region.

- We won't offer the -K8s ones, since that likely conflicts with whatever
  we are configuring. So we assume not an -K8s one.

- The NVLink-v2 A100 and normal A100 are the same price, but the NVLink-v2 has
  more than 2x the RAM, and as I check now, way more availability. So it's
  worth offering both, though this will complicate our UI a little.

*/

import { field_cmp } from "@cocalc/util/misc";

// These are the supported flavors that we want to allow and include at the time of writing.
// We explicitly exclude the K8s one as of right now (April 2024), but nothing else.
// When new flavors pop up, we will explicitly update our code to support them after doing
// full testing.
export const SUPPORTED_FLAVORS = [
  "n1-A100x1",
  "n1-A100x2",
  "n1-A100x4",
  "n2-A100x4",
  "n2-A100x8",
  "n2-A100x8-NVLink-v2",
  "n2-A100x1",
  "n2-H100x4",
  "n2-H100x8",
  "n2-H100x1",
  "n2-H100x2",
  "n2-L40x1",
  "n2-L40x2",
  "n2-L40x4",
  "n2-L40x8",
  "n2-RTX-A4000x1",
  "n2-RTX-A4000x2",
  "n2-RTX-A4000x4",
  "n2-RTX-A4000x8",
  "n2-RTX-A4000x10",
  "n2-RTX-A5000x1",
  "n2-RTX-A5000x2",
  "n2-RTX-A5000x4",
  "n2-RTX-A5000x8",
  "n1-RTX-A6000x1",
  "n1-RTX-A6000x2",
  "n1-RTX-A6000x4",
  "n1-RTX-A6000x1",
  "n1-RTX-A6000x2",
  "n1-RTX-A6000x4",
  "n1-RTX-A6000x8",
  "n1-RTX-A6000x8-a",
  "n1-RTX-A6000-ADAx1",
  "n1-RTX-A6000-ADAx2",
  "n1-RTX-A6000-ADAx4",
] as const;

const SUPPORTED_FLAVORS_SET = new Set(SUPPORTED_FLAVORS);
function isSupportedFlavor(flavor_name: string): boolean {
  return SUPPORTED_FLAVORS_SET.has(flavor_name as any);
}

interface Flavor {
  model: string;
  count: string;
}

export function parseFlavor(flavor_name): Flavor {
  const i = flavor_name.lastIndexOf("x"); // assumes "-NVLink-v2" and "-a" don't contain an "x".
  const model = flavor_name.slice(0, i);
  const count = flavor_name.slice(i + 1);
  return { model, count };
}

function countToNumber(count: string): number {
  return parseFloat(count.split("-")[0]);
}

export function encodeFlavor(flavor: Flavor): string {
  const { model, count } = flavor;
  return `${model}x${count}`;
}

export function getModelOptions(priceData): {
  region: string;
  model: string;
  available: number;
  cost_per_hour: number;
  gpu: string;
}[] {
  const seen = new Set<string>([]);
  const options: {
    region: string;
    model: string;
    available: number;
    cost_per_hour: number;
    gpu: string;
  }[] = [];
  for (const key in priceData.options) {
    const [region, flavor] = key.split("|");
    if (!isSupportedFlavor(flavor)) {
      continue;
    }
    const { model, count } = parseFlavor(flavor);
    if (count != "1") {
      continue;
    }
    const x = `${region}|${model}`;
    if (seen.has(x)) {
      continue;
    }
    seen.add(x);
    const { cost_per_hour, gpu } = priceData.options[key];
    const n = countToNumber(count);
    const available = modelAvailability({ region, model, priceData });
    options.push({
      region,
      model,
      cost_per_hour: cost_per_hour / n,
      available,
      gpu,
    });
  }
  return options.sort(field_cmp("cost_per_hour"));
}

export function getCountOptions({ flavor_name, region_name, priceData }): {
  count: string;
  quantity: number;
  available: number;
  cost_per_hour: number;
  gpu: string;
}[] {
  const { model } = parseFlavor(flavor_name);
  const options: {
    count: string;
    quantity: number;
    available: number;
    cost_per_hour: number;
    gpu: string;
  }[] = [];
  for (const key in priceData.options) {
    const [region, flavor] = key.split("|");
    if (region != region_name || !isSupportedFlavor(flavor)) {
      continue;
    }
    const x = parseFlavor(flavor);
    const { cost_per_hour, gpu } = priceData.options[key];
    if (x.model == model) {
      options.push({
        count: x.count,
        quantity: parseFloat(x.count.split("-")[0]),
        available: priceData.options[key]?.available ?? 0,
        cost_per_hour,
        gpu,
      });
    }
  }
  options.sort(field_cmp("quantity"));
  return options;
}

// return total number of GPUs of the given model that are currently available
export function modelAvailability({ region, model, priceData }) {
  let available = 0;
  for (const key in priceData.options) {
    const [region0, flavor] = key.split("|");
    if (region != region0) {
      continue;
    }
    const x = parseFlavor(flavor);
    if (x.model != model) {
      continue;
    }
    available += priceData.options[key]?.available ?? 0;
  }
  return available;
}

export function bestCount({ model, region, count, priceData }): string {
  const opts = getCountOptions({
    flavor_name: encodeFlavor({ model, count }),
    region_name: region,
    priceData,
  });
  for (const x of opts) {
    if (x.count == count && x.available) {
      return x.count;
    }
  }
  for (const x of opts) {
    if (x.available) {
      return x.count;
    }
  }
  return opts[0]?.count ?? "1";
}
