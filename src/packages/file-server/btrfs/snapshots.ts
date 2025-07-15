import { type SubvolumeSnapshot } from "./subvolume-snapshot";
import getLogger from "@cocalc/backend/logger";

const logger = getLogger("file-server:storage-btrfs:snapshots");

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

export interface SnapshotCounts {
  frequent: number;
  daily: number;
  weekly: number;
  monthly: number;
}

export async function updateRollingSnapshots({
  snapshot,
  counts,
}: {
  snapshot: SubvolumeSnapshot;
  counts?: Partial<SnapshotCounts>;
}) {
  counts = { ...DEFAULT_SNAPSHOT_COUNTS, ...counts };

  const changed = await snapshot.hasUnsavedChanges();
  logger.debug("updateRollingSnapshots", {
    name: snapshot.subvolume.name,
    counts,
    changed,
  });
  if (!changed) {
    // definitely no data written since most recent snapshot, so nothing to do
    return;
  }

  // get exactly the iso timestamp snapshot names:
  const snapshots = (await snapshot.ls())
    .map((x) => x.name)
    .filter((name) => DATE_REGEXP.test(name));
  snapshots.sort();
  if (snapshots.length > 0) {
    const age = Date.now() - new Date(snapshots.slice(-1)[0]).valueOf();
    for (const key in SNAPSHOT_INTERVALS_MS) {
      if (counts[key]) {
        if (age < SNAPSHOT_INTERVALS_MS[key]) {
          // no need to snapshot since there is already a sufficiently recent snapshot
          logger.debug("updateRollingSnapshots: no need to snapshot", {
            name: snapshot.subvolume.name,
          });
          return;
        }
        // counts[key] nonzero and snapshot is old enough so we'll be making a snapshot
        break;
      }
    }
  }

  // make a new snapshot
  const name = new Date().toISOString();
  await snapshot.create(name);
  // delete extra snapshots
  snapshots.push(name);
  const toDelete = snapshotsToDelete({ counts, snapshots });
  for (const expired of toDelete) {
    try {
      await snapshot.delete(expired);
    } catch {
      // some snapshots can't be deleted, e.g., they were used for the last send.
    }
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
