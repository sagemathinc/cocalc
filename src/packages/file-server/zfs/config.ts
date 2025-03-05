import { join } from "path";

export const PREFIX = process.env.COCALC_TEST_MODE
  ? "cocalcfs-test"
  : "cocalcfs";

export const DATA = `/${PREFIX}`;

export const SQLITE3_DATABASE_FILE = join(DATA, "database.sqlite3");

// we ONLY put filesystems on pools whose name have this prefix.
// all other pools are ignored.
export const POOL_PREFIX = PREFIX;

export const context = {
  namespace: process.env.NAMESPACE ?? "default",
};

// Every filesystem has at least this much quota (?)
export const MIN_QUOTA = 1024 * 1024 * 1; // 1MB

// We periodically do "zpool list" to find out what pools are available
// and how much space they have left.  This info is cached for this long
// to avoid excessive calls:
export const POOLS_CACHE_MS = 15000;

// Directory on server where filesystems get mounted (so NFS can serve them)
export const FILESYSTEMS = join(DATA, "filesystems");

// Directory on server where zfs send streams (and tar?) are stored
export const ARCHIVES = join(DATA, "archives");

// Directory for bup
export const BUP = join(DATA, "bup");

// two hour default for running any commands (e.g., zfs send/recv)
export const DEFAULT_EXEC_TIMEOUT_MS = 2 * 1000 * 60 * 60;

// **all** user files for filesystems have this owner and group.
export const UID = 2001;
export const GID = 2001;

// We make/update snapshots periodically, with this being the minimum interval.
export const SNAPSHOT_INTERVAL_MS = 60 * 30 * 1000;
//export const SNAPSHOT_INTERVAL_MS = 10 * 1000;

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

// Minimal interval for bup backups
export const BUP_INTERVAL_MS = 24 * 1000 * 60 * 60;

// minimal interval for zfs streams
export const STREAM_INTERVAL_MS = 24 * 1000 * 60 * 60;
// when more than this many streams, we recompact down
export const MAX_STREAMS = 30;
