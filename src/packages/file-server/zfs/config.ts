// we ONLY put projects on pools whose name has this prefix.
// all other pools are ignored.
export const POOL_PREFIX = "cocalcfs";

export const context = {
  namespace: process.env.NAMESPACE ?? "default",
};

// Every project always has at least this much quota
export const MIN_QUOTA = 1024 * 1024 * 1024; // 1G

// We periodically do "zpool list" to find out what pools are available
// and how much space they have left.  This info is cached for this long
// to avoid excessive calls:
export const POOLS_CACHE_MS = 15000;

// Directory on server where all projects are mounted
export const PROJECTS = "/cocalcfs/projects";

// Directory on server where zfs send streams (and tar?) are stored
export const ARCHIVES = "/cocalcfs/archives";

// two hour default for running any commands (e.g., zfs send/recv)
export const DEFAULT_EXEC_TIMEOUT_MS = 2 * 1000 * 60 * 60;

// **all** user files for projects have this owner and group.
export const UID = 2001;
export const GID = 2001;

// We make/update snapshots periodically, with this being the minimum interval.
//const SNAPSHOT_INTERVAL_MS = 60 * 30 * 1000;
export const SNAPSHOT_INTERVAL_MS = 10 * 1000;

// Lengths of time in minutes to keep these snapshots
export const SNAPSHOT_INTERVALS_MS = {
  halfhourly: 30 * 1000 * 60,
  daily: 60 * 24 * 1000 * 60,
  weekly: 60 * 24 * 7 * 1000 * 60,
  monthly: 60 * 24 * 7 * 4 * 1000 * 60,
};

// How many of each type of snapshot to retain
export const SNAPSHOT_COUNTS = {
  halfhourly: 24,
  daily: 14,
  weekly: 7,
  monthly: 4,
};
