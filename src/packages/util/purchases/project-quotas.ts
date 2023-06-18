export const DESCRIPTION = {
  cores: "price per month for 1 vCPU",
  memory: "price per month for 1GB of RAM",
  disk_quota: "price per month for 1GB of disk",
  member_host: "non-disk part of non-member hosting cost is divided by this",
};

export function getPricePerHour(
  quota: {
    cores?: number;
    disk_quota?: number;
    memory?: number;
    member_host?: number;
  },
  price_per_month: {
    cores: number; // price per month for 1 vCPU
    disk_quota: number; // price per month for 1GB of disk
    memory: number; // price per month for 1GB RAM
    member_host: number; // cost multiple for non pre-emptible/less loaded (i.e., member hosting)
  }
): number {
  // start with the core and memory pricing, which are separate.
  let price =
    (quota.cores ?? 1) * price_per_month.cores +
    ((quota.memory ?? 1000) * price_per_month.memory) / 1000;

  // member hosting
  if (!quota.member_host) {
    price /= price_per_month.member_host;
  }

  // disk price doesn't depend on member or not
  price += ((quota.disk_quota ?? 1000) * price_per_month.disk_quota) / 1000;

  // convert from month to hour
  price /= 24 * 30.5;

  return price;
}
