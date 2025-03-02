// we ONLY put projects on pools whose name has this prefix.
// all other pools are ignored.
// TODO: change to 'projects'?
export const POOL_PREFIX = "tank";

export const context = {
  namespace: process.env.NAMESPACE ?? "default",
};

export const DEFAULT_QUOTA = "1G";

// We periodically do "zpool list" to find out what pools are available
// and how much space they have left.  This info is cached for this long
// to avoid excessive calls:
export const POOLS_CACHE_MS = 15000;
