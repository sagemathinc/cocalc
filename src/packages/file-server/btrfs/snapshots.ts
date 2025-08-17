import { type SubvolumeSnapshots } from "./subvolume-snapshots";
import getLogger from "@cocalc/backend/logger";

const logger = getLogger("file-server:btrfs:snapshots");

const DATE_REGEXP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

// Lengths of time in minutes to keep snapshots
// (code below assumes these are listed in ORDER from shortest to longest)
export const SNAPSHOT_INTERVALS_MS = {
  frequent: 15 * 1000 * 60,
  daily: 60 * 24 * 1000 * 60,
  weekly: 60 * 24 * 7 * 1000 * 60,
  monthly: 60 * 24 * 7 * 4 * 1000 * 60,
};

// How many of each type of snapshot to retain
export const DEFAULT_SNAPSHOT_COUNTS = {
  frequent: 24,
  daily: 14,
  weekly: 7,
  monthly: 4,
} as SnapshotCounts;

// We have at least one snapshot for each interval, assuming
// there are actual changes since the last snapshot, and at
// most the listed number.
export interface SnapshotCounts {
  frequent: number;
  daily: number;
  weekly: number;
  monthly: number;
}

export async function updateRollingSnapshots({
  snapshots,
  counts,
  opts,
}: {
  snapshots: SubvolumeSnapshots;
  counts?: Partial<SnapshotCounts>;
  // options to create
  opts?;
}) {
  counts = { ...DEFAULT_SNAPSHOT_COUNTS, ...counts };

  const changed = await snapshots.hasUnsavedChanges();
  logger.debug("updateRollingSnapshots", {
    name: snapshots.subvolume.name,
    counts,
    changed,
  });

  // get exactly the iso timestamp snapshot names:
  const snapshotNames = (await snapshots.readdir()).filter((name) =>
    DATE_REGEXP.test(name),
  );
  snapshotNames.sort();
  let needNewSnapshot = false;
  if (changed) {
    const timeSinceLastSnapshot =
      snapshotNames.length == 0
        ? 1e12 // infinitely old
        : Date.now() - new Date(snapshotNames.slice(-1)[0]).valueOf();
    for (const key in SNAPSHOT_INTERVALS_MS) {
      if (counts[key] && timeSinceLastSnapshot > SNAPSHOT_INTERVALS_MS[key]) {
        // there is NOT a sufficiently recent snapshot to satisfy the constraint
        // of having at least one snapshot for the given interval.
        needNewSnapshot = true;
        break;
      }
    }
  }

  // Regarding error reporting we try to do everything below and throw the
  // create error or last delete error...

  let createError: any = undefined;
  if (changed && needNewSnapshot) {
    // make a new snapshot -- but only bother
    // definitely no data written since most recent snapshot, so nothing to do
    const name = new Date().toISOString();
    logger.debug(
      "updateRollingSnapshots: creating snapshot of",
      snapshots.subvolume.name,
    );
    try {
      await snapshots.create(name, opts);
      snapshotNames.push(name);
    } catch (err) {
      createError = err;
    }
  }

  // delete extra snapshots
  const toDelete = snapshotsToDelete({ counts, snapshots: snapshotNames });
  let deleteError: any = undefined;
  for (const name of toDelete) {
    try {
      logger.debug(
        "updateRollingSnapshots: deleting snapshot of",
        snapshots.subvolume.name,
        name,
      );
      await snapshots.delete(name);
    } catch (err) {
      // ONLY report this if create doesn't error, to give both delete and create a chance to run.
      deleteError = err;
    }
  }

  if (createError) {
    throw createError;
  }
  if (deleteError) {
    throw deleteError;
  }
}

function snapshotsToDelete({ counts, snapshots }): string[] {
  if (snapshots.length == 0) {
    // nothing to do
    return [];
  }

  // sorted from BIGGEST to smallest
  const times = snapshots.map((x) => new Date(x).valueOf());
  times.reverse();
  const save = new Set<number>();
  for (const type in counts) {
    const count = counts[type];
    const length_ms = SNAPSHOT_INTERVALS_MS[type];

    // Pick the first count newest snapshots at intervals of length
    // length_ms milliseconds.
    let n = 0,
      i = 0,
      last_tm = 0;
    while (n < count && i < times.length) {
      const tm = times[i];
      if (!last_tm || tm <= last_tm - length_ms) {
        save.add(tm);
        last_tm = tm;
        n += 1; // found one more
      }
      i += 1; // move to next snapshot
    }
  }
  return snapshots.filter((x) => !save.has(new Date(x).valueOf()));
}
