import type { PurchaseOption } from "@cocalc/util/compute/cloud/hyperstack/pricing";
import { GPU_SPECS } from "@cocalc/util/compute/gpu-specs";
import { field_cmp } from "@cocalc/util/misc";

// Return list of GPU models that Hyperstack sells along with links to their pages.
// This could just be hardcoded, but instead we compute it from actual pricing data
// that comes from their api, combined with our specs data about GPU's.   In the
// longrun this should be more maintainable and dynamic.
export function getModelLinks(priceData) {
  const x: { [name: string]: { url?: string; cost: number } } = {};
  for (const option of Object.values(priceData.options) as PurchaseOption[]) {
    const { cost_per_hour, gpu_count, gpu } = option;
    const name = toGPU(gpu);
    if (typeof cost_per_hour == "string") {
      continue;
    }
    const cost = cost_per_hour / gpu_count;
    if (x[name] != null && x[name].cost <= cost) {
      continue;
    }
    const gpuSpec = GPU_SPECS[name];
    if (gpuSpec == null) {
      continue;
    }
    x[name] = { url: gpuSpec?.hyperstack ?? gpuSpec?.datasheet, cost };
  }
  const models: { name: string; url?: string; cost: number }[] = [];
  for (const name in x) {
    models.push({ name: name.replace("-PCIe", ""), ...x[name] });
  }
  models.sort(field_cmp("cost"));
  models.reverse();
  return models;
}

export function toGPU(gpu) {
  gpu = gpu.replace("G-", "GB-");
  if (gpu.endsWith("-sm")) {
    return gpu.slice(0, -3);
  }
  gpu = gpu.replace("-NVLink", "");
  gpu = gpu.replace("-k8s", "");
  gpu = gpu.replace("-ada", "");
  return gpu;
}

