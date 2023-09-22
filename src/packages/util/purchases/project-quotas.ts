export const DESCRIPTION = {
  cores: "price per month for 1 vCPU",
  memory: "price per month for 1GB of RAM",
  disk_quota: "price per month for 1GB of disk",
  member_host: "non-disk part of non-member hosting cost is divided by this",
  gpu: "price per month for 1 GPU",
};

export function getPricePerHour(
  quota: {
    cores?: number;
    disk_quota?: number;
    memory?: number;
    member_host?: number;
    gpu?: number;
  },
  price_per_month: {
    cores: number; // price per month for 1 vCPU
    disk_quota: number; // price per month for 1GB of disk
    memory: number; // price per month for 1GB RAM
    member_host: number; // cost multiple for non pre-emptible/less loaded (i.e., member hosting)
    gpu?: number; // price per month for 1 GPU
  }
): number {
  // This is just a safeguard when this is introduced. When you read this, you can probably remove it.
  const gpu_price = price_per_month.gpu ?? 4 * price_per_month.cores;

  // start with the core and memory pricing, which are separate.
  let price =
    (quota.cores ?? 1) * price_per_month.cores +
    ((quota.memory ?? 1000) * price_per_month.memory) / 1000 +
    (quota.gpu ?? 0) * gpu_price;

  // member hosting
  if (!quota.member_host) {
    price /= price_per_month.member_host;
  }

  // disk price doesn't depend on member or not.
  // The first 3GB are included for free.
  if (quota.disk_quota && quota.disk_quota > 3000) {
    price += ((quota.disk_quota - 3000) * price_per_month.disk_quota) / 1000;
  }

  // convert from month to hour
  price /= 24 * 30.5;

  return price;
}
