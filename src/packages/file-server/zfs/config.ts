import { join } from "path";
import { databaseFilename } from "./names";

// we ONLY put filesystems on pools whose name have this prefix.
// all other pools are ignored.  We also mount everything in /{PREFIX} on the filesystem.
const PREFIX = process.env.COCALC_TEST_MODE ? "cocalcfs-test" : "cocalcfs";

const DATA = `/${PREFIX}`;

const SQLITE3_DATABASE_FILE = databaseFilename(DATA);

// Directory on server where filesystems get mounted (so NFS can serve them)
const FILESYSTEMS = join(DATA, "filesystems");

// Directory on server where zfs send streams (and tar?) are stored
const ARCHIVES = join(DATA, "archives");

// Directory to store data used in pulling as part of sync.
// E.g., this keeps around copies of the sqlite state database of each remote.
const PULL = join(DATA, "pull");

// Directory for bup
const BUP = join(DATA, "bup");

export const context = {
  namespace: process.env.NAMESPACE ?? "default",
  PREFIX,
  DATA,
  SQLITE3_DATABASE_FILE,
  FILESYSTEMS,
  ARCHIVES,
  PULL,
  BUP,
};

// WARNING: this "setContext" is global. It's very useful for **UNIT TESTING**, but
// for any other use, you want to set this at most once and never again!!!  The reason
// is because with nodejs you could have async code running all over the place, and
// changing the context out from under it would lead to nonsense and corruption.
export function setContext({
  namespace,
  prefix,
}: {
  namespace?: string;
  prefix?: string;
}) {
  context.namespace = namespace ?? process.env.NAMESPACE ?? "default";
  context.PREFIX = prefix ?? PREFIX;
  context.DATA = `/${context.PREFIX}`;
  context.SQLITE3_DATABASE_FILE = databaseFilename(context.DATA);
  context.FILESYSTEMS = join(context.DATA, "filesystems");
  context.ARCHIVES = join(context.DATA, "archives");
  context.PULL = join(context.DATA, "pull");
  context.BUP = join(context.DATA, "bup");
}

// Every filesystem has at least this much quota (?)
export const MIN_QUOTA = 1024 * 1024 * 1; // 1MB

// We periodically do "zpool list" to find out what pools are available
// and how much space they have left.  This info is cached for this long
// to avoid excessive calls:
export const POOLS_CACHE_MS = 15000;

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
