import { Upgrades } from "./quota";

// not all keys can be used, only those in Upgrade Quotas
export const GPU_QUOTAS: Partial<Upgrades & { gpu: number }> = {
  cores: 1,
  disk_quota: 15000,
  memory: 6000,
  mintime: 4,
  network: 1,
  member_host: 1,
  always_running: 0,
  gpu: 1,
};
