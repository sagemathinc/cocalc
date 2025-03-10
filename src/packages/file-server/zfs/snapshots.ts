/*
Manage creating and deleting rolling snapshots of a filesystem.

We keep track of all state in the sqlite database, so only have to touch
ZFS when we actually need to do something.  Keep this in mind though since
if you try to mess with snapshots directly then the sqlite database won't
know you did that.
*/

import { exec } from "./util";
import { get, getRecent, set } from "./db";
import { filesystemDataset, filesystemMountpoint } from "./names";
import { splitlines } from "@cocalc/util/misc";
import getLogger from "@cocalc/backend/logger";
import {
  SNAPSHOT_INTERVAL_MS,
  SNAPSHOT_INTERVALS_MS,
  SNAPSHOT_COUNTS,
} from "./config";
import { syncProperties } from "./properties";
import { primaryKey, type PrimaryKey } from "./types";
import { isEqual } from "lodash";

const logger = getLogger("file-server:zfs/snapshots");

export async function maintainSnapshots(cutoff?: Date) {
  await deleteExtraSnapshotsOfActiveFilesystems(cutoff);
  await snapshotActiveFilesystems(cutoff);
}

// If there any changes to the filesystem since the last snapshot,
// and there are no snapshots since SNAPSHOT_INTERVAL_MS ms ago,
// make a new one.  Always returns the most recent snapshot name.
// Error if filesystem is archived.
export async function createSnapshot({
  force,
  ifChanged,
  ...fs
}: PrimaryKey & {
  force?: boolean;
  // note -- ifChanged is VERY fast, but it's not instantaneous...
  ifChanged?: boolean;
}): Promise<string> {
  logger.debug("createSnapshot: ", fs);
  const pk = primaryKey(fs);
  const { pool, archived, snapshots } = get(pk);
  if (archived) {
    throw Error("cannot snapshot an archived filesystem");
  }
  if (!force && !ifChanged && snapshots.length > 0) {
    // check for sufficiently recent snapshot
    const last = new Date(snapshots[snapshots.length - 1]);
    if (Date.now() - last.valueOf() < SNAPSHOT_INTERVAL_MS) {
      // snapshot sufficiently recent
      return snapshots[snapshots.length - 1];
    }
  }

  // Check to see if nothing change on disk since last snapshot - if so, don't make a new one:
  if (!force && snapshots.length > 0) {
    const written = await getWritten(pk);
    if (written == 0) {
      // for sure definitely nothing written, so no possible
      // need to make a snapshot
      return snapshots[snapshots.length - 1];
    }
  }

  const snapshot = new Date().toISOString();
  await exec({
    verbose: true,
    command: "sudo",
    args: [
      "zfs",
      "snapshot",
      `${filesystemDataset({ ...pk, pool })}@${snapshot}`,
    ],
    what: { ...pk, desc: "creating snapshot of project" },
  });
  set({
    ...pk,
    snapshots: ({ snapshots }) => [...snapshots, snapshot],
  });
  syncProperties(pk);
  return snapshot;
}

async function getWritten(fs: PrimaryKey) {
  const pk = primaryKey(fs);
  const { pool } = get(pk);
  const { stdout } = await exec({
    verbose: true,
    command: "zfs",
    args: ["list", "-Hpo", "written", filesystemDataset({ ...pk, pool })],
    what: {
      ...pk,
      desc: "getting amount of newly written data in project since last snapshot",
    },
  });
  return parseInt(stdout);
}

export async function zfsGetSnapshots(dataset: string) {
  const { stdout } = await exec({
    command: "zfs",
    args: ["list", "-j", "-o", "name", "-r", "-t", "snapshot", dataset],
  });
  const snapshots = Object.keys(JSON.parse(stdout).datasets).map(
    (name) => name.split("@")[1],
  );
  return snapshots;
}

// gets snapshots from disk via zfs *and* sets the list of snapshots
// in the database to match (and also updates sizes)
export async function getSnapshots(fs: PrimaryKey) {
  const pk = primaryKey(fs);
  const filesystem = get(fs);
  const snapshots = await zfsGetSnapshots(filesystemDataset(filesystem));
  if (!isEqual(snapshots, filesystem.snapshots)) {
    set({ ...pk, snapshots });
    syncProperties(fs);
  }
  return snapshots;
}

export async function deleteSnapshot({
  snapshot,
  ...fs
}: PrimaryKey & { snapshot: string }) {
  const pk = primaryKey(fs);
  logger.debug("deleteSnapshot: ", pk, snapshot);
  const { pool, last_send_snapshot } = get(pk);
  if (snapshot == last_send_snapshot) {
    throw Error(
      "can't delete snapshot since it is the last one used for a zfs send",
    );
  }
  await exec({
    verbose: true,
    command: "sudo",
    args: [
      "zfs",
      "destroy",
      `${filesystemDataset({ ...pk, pool })}@${snapshot}`,
    ],
    what: { ...pk, desc: "destroying a snapshot of a project" },
  });
  set({
    ...pk,
    snapshots: ({ snapshots }) => snapshots.filter((x) => x != snapshot),
  });
  syncProperties(pk);
}

/*
Remove snapshots according to our retention policy, and
never delete last_stream if set.

Returns names of deleted snapshots.
*/
export async function deleteExtraSnapshots(fs: PrimaryKey): Promise<string[]> {
  const pk = primaryKey(fs);
  logger.debug("deleteExtraSnapshots: ", pk);
  const { last_send_snapshot, snapshots } = get(pk);
  if (snapshots.length == 0) {
    // nothing to do
    return [];
  }

  // sorted from BIGGEST to smallest
  const times = snapshots.map((x) => new Date(x).valueOf());
  times.reverse();
  const save = new Set<number>();
  if (last_send_snapshot) {
    save.add(new Date(last_send_snapshot).valueOf());
  }
  for (const type in SNAPSHOT_COUNTS) {
    const count = SNAPSHOT_COUNTS[type];
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
  const toDelete = snapshots.filter((x) => !save.has(new Date(x).valueOf()));
  for (const snapshot of toDelete) {
    await deleteSnapshot({ ...pk, snapshot });
  }
  return toDelete;
}

// Go through ALL projects with last_edited >= cutoff stored
// here and run trimActiveFilesystemSnapshots.
export async function deleteExtraSnapshotsOfActiveFilesystems(cutoff?: Date) {
  const v = getRecent({ cutoff });
  logger.debug(
    `deleteSnapshotsOfActiveFilesystems: considering ${v.length} filesystems`,
  );
  let i = 0;
  for (const fs of v) {
    if (fs.archived) {
      continue;
    }
    try {
      await deleteExtraSnapshots(fs);
    } catch (err) {
      logger.debug(`deleteSnapshotsOfActiveFilesystems: error -- ${err}`);
    }
    i += 1;
    if (i % 10 == 0) {
      logger.debug(`deleteSnapshotsOfActiveFilesystems: ${i}/${v.length}`);
    }
  }
}

// Go through ALL projects with last_edited >= cutoff and snapshot them
// if they are due a snapshot.
// cutoff = a Date (default = 1 week ago)
export async function snapshotActiveFilesystems(cutoff?: Date) {
  logger.debug("snapshotActiveFilesystems: getting...");
  const v = getRecent({ cutoff });
  logger.debug(
    `snapshotActiveFilesystems: considering ${v.length} projects`,
    cutoff,
  );
  let i = 0;
  for (const fs of v) {
    if (fs.archived) {
      continue;
    }
    try {
      await createSnapshot(fs);
    } catch (err) {
      // error is already logged in error field of database
      logger.debug(`snapshotActiveFilesystems: error -- ${err}`);
    }
    i += 1;
    if (i % 10 == 0) {
      logger.debug(`snapshotActiveFilesystems: ${i}/${v.length}`);
    }
  }
}

/*
Get list of files modified since given snapshot (or last snapshot if not given).

**There's probably no good reason to ever use this code!**

The reason is because it's really slow, e.g., I added the
cocalc src directory (5000) files and it takes about 6 seconds
to run this.  In contrast. "time find .", which lists EVERYTHING
takes less than 0.074s.  You could do that before and after, then
compare them, and it'll be a fraction of a second.
*/
interface Mod {
  time: number;
  change: "-" | "+" | "M" | "R"; // remove/create/modify/rename
  // see "man zfs diff":
  type: "B" | "C" | "/" | ">" | "|" | "@" | "P" | "=" | "F";
  path: string;
}

export async function getModifiedFiles({
  snapshot,
  ...fs
}: PrimaryKey & { snapshot: string }) {
  const pk = primaryKey(fs);
  logger.debug(`getModifiedFiles: `, pk);
  const { pool, snapshots } = get(pk);
  if (snapshots.length == 0) {
    return [];
  }
  if (snapshot == null) {
    snapshot = snapshots[snapshots.length - 1];
  }
  const { stdout } = await exec({
    verbose: true,
    command: "sudo",
    args: [
      "zfs",
      "diff",
      "-FHt",
      `${filesystemDataset({ ...pk, pool })}@${snapshot}`,
    ],
    what: { ...pk, desc: "getting files modified since last snapshot" },
  });
  const mnt = filesystemMountpoint(pk) + "/";
  const files: Mod[] = [];
  for (const line of splitlines(stdout)) {
    const x = line.split(/\t/g);
    let path = x[3];
    if (path.startsWith(mnt)) {
      path = path.slice(mnt.length);
    }
    files.push({
      time: parseFloat(x[0]) * 1000,
      change: x[1] as any,
      type: x[2] as any,
      path,
    });
  }
  return files;
}
