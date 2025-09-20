import { type SubvolumeSnapshots } from "./subvolume-snapshots";
import { type SubvolumeRustic } from "./subvolume-rustic";
import {
  SNAPSHOT_INTERVALS_MS,
  DEFAULT_SNAPSHOT_COUNTS,
  type SnapshotCounts,
} from "@cocalc/util/consts/snapshots";
import getLogger from "@cocalc/backend/logger";
import { isISODate } from "@cocalc/util/misc";

export { type SnapshotCounts };

const logger = getLogger("file-server:btrfs:snapshots");

export async function updateRollingSnapshots({
  snapshots,
  counts,
  opts,
}: {
  snapshots: SubvolumeSnapshots | SubvolumeRustic;
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
  const snapshotNames = (await snapshots.readdir()).filter(isISODate);
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
