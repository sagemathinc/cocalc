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

export type HyperstackPriceData = PurchaseOption[];
