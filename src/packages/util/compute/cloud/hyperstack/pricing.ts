export interface PurchaseOption {
  flavor_name: string;
  // name of region that has this machine type
  region_name: string;
  // number of vCPUs
  cpu: number;
  // GB of ram
  ram: number;
  // GB of less ephemeral disk (?)
  disk: number;
  // GB of local ephemeral disk
  ephemeral: number;
  // string that describes the GPU
  gpu: string;
  // how many gpu's in this machine
  gpu_count: number;
  // number of these VM's that are currently available
  available?: number;
  // how much this option costs per hour, or a string with an error
  // if we can't determine the cost
  cost_per_hour: number | string;
}

export function optionKey({ region_name, flavor_name }) {
  return `${region_name}|${flavor_name}`;
}

export interface HyperstackPriceData {
  markup: number;
  // region_bar_flavor is `${region_name}|${flavor_name}` as in optionKey function above!
  options: { [region_bar_flavor: string]: PurchaseOption };
  // cost per hour of an external ip address
  external_ip_cost_per_hour: number;
  // cost per hour per GB of disk storage (for storage volumes)
  ssd_cost_per_hour: number;
}

export function markup({ cost, priceData }) {
  if (priceData.markup) {
    return cost * (1 + priceData.markup / 100.0);
  }
  return cost;
}
