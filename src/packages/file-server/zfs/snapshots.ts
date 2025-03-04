/*
Manage creating and deleting rolling snapshots of a project's filesystem.

We keep track of all state in the sqlite database, so only have to touch
ZFS when we actually need to do something.  Keep this in mind though since
if you try to mess with snapshots directly then the sqlite database won't
know you did that.
*/

import { exec } from "./util";
import { get, getRecent, set } from "./db";
import { projectDataset, projectMountpoint } from "./names";
import { splitlines } from "@cocalc/util/misc";
import getLogger from "@cocalc/backend/logger";
import {
  context,
  SNAPSHOT_INTERVAL_MS,
  SNAPSHOT_INTERVALS_MS,
  SNAPSHOT_COUNTS,
} from "./config";
import { syncProperties } from "./properties";

const logger = getLogger("file-server:zfs/snapshots");

export async function maintainSnapshots(cutoff?: Date) {
  await deleteExtraSnapshotsOfActiveProjects(cutoff);
  await snapshotActiveProjects(cutoff);
}

// If there any changes to the project since the last snapshot,
// and there are no snapshots since SNAPSHOT_INTERVAL_MS ms ago,
// make a new one.  Always returns the most recent snapshot name.
// Error if project is archived.
export async function createSnapshot({
  project_id,
  namespace = context.namespace,
  force,
  ifChanged,
}: {
  project_id: string;
  namespace?: string;
  force?: boolean;
  ifChanged?: boolean;
}): Promise<string> {
  logger.debug("createSnapshot: ", { project_id, namespace });
  const { pool, archived, snapshots } = get({ project_id, namespace });
  if (archived) {
    throw Error("cannot snapshot an archived project");
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
    const written = await getWritten({ project_id, namespace });
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
      `${projectDataset({ project_id, namespace, pool })}@${snapshot}`,
    ],
    what: { project_id, namespace, desc: "creating snapshot of project" },
  });
  set({
    project_id,
    namespace,
    snapshots: ({ snapshots }) => [...snapshots, snapshot],
  });
  syncProperties({ project_id, namespace });
  return snapshot;
}

async function getWritten({ project_id, namespace }) {
  const { pool } = get({ project_id, namespace });
  const { stdout } = await exec({
    verbose: true,
    command: "zfs",
    args: [
      "list",
      "-Hpo",
      "written",
      projectDataset({ project_id, namespace, pool }),
    ],
    what: {
      project_id,
      namespace,
      desc: "getting amount of newly written data in project since last snapshot",
    },
  });
  return parseInt(stdout);
}

export async function getSnapshots({
  project_id,
  namespace = context.namespace,
}) {
  const project = get({
    project_id,
    namespace,
  });
  const { stdout } = await exec({
    command: "zfs",
    args: [
      "list",
      "-j",
      "-o",
      "name",
      "-r",
      "-t",
      "snapshot",
      projectDataset(project),
    ],
  });
  return Object.keys(JSON.parse(stdout).datasets).map(
    (name) => name.split("@")[1],
  );
}

export async function deleteSnapshot({
  project_id,
  namespace = context.namespace,
  snapshot,
}) {
  logger.debug("deleteSnapshot: ", { project_id, namespace });
  const { pool, last_send_snapshot } = get({
    project_id,
    namespace,
  });
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
      `${projectDataset({ project_id, namespace, pool })}@${snapshot}`,
    ],
    what: { project_id, namespace, desc: "destroying a snapshot of a project" },
  });
  set({
    project_id,
    namespace,
    snapshots: ({ snapshots }) => snapshots.filter((x) => x != snapshot),
  });
  syncProperties({ project_id, namespace });
}

/*
Remove snapshots according to our retention policy, and
never delete last_stream if set.

Returns names of deleted snapshots.
*/
export async function deleteExtraSnapshots({
  project_id,
  namespace = context.namespace,
}): Promise<string[]> {
  logger.debug("deleteExtraSnapshots: ", { project_id, namespace });
  const { last_send_snapshot, snapshots } = get({
    project_id,
    namespace,
  });
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
    await deleteSnapshot({ project_id, namespace, snapshot });
  }
  return toDelete;
}

// Go through ALL projects with last_edited >= cutoff stored
// here and run trimActiveProjectSnapshots.
export async function deleteExtraSnapshotsOfActiveProjects(cutoff?: Date) {
  const v = getRecent({ cutoff });
  logger.debug(
    `deleteSnapshotsOfActiveProjects: considering ${v.length} projects`,
  );
  let i = 0;
  for (const { project_id, namespace, archived } of v) {
    if (archived) {
      continue;
    }
    try {
      await deleteExtraSnapshots({ project_id, namespace });
    } catch (err) {
      logger.debug(`deleteSnapshotsOfActiveProjects: error -- ${err}`);
    }
    i += 1;
    if (i % 10 == 0) {
      logger.debug(`deleteSnapshotsOfActiveProjects: ${i}/${v.length}`);
    }
  }
}

// Go through ALL projects with last_edited >= cutoff and snapshot them
// if they are due a snapshot.
// cutoff = a Date (default = 1 week ago)
export async function snapshotActiveProjects(cutoff?: Date) {
  logger.debug("snapshotActiveProjects: getting...");
  const v = getRecent({ cutoff });
  logger.debug(
    `snapshotActiveProjects: considering ${v.length} projects`,
    cutoff,
  );
  let i = 0;
  for (const { project_id, namespace, archived } of v) {
    if (archived) {
      continue;
    }
    try {
      await createSnapshot({ project_id, namespace });
    } catch (err) {
      // error is already logged in error field of database
      logger.debug(`snapshotActiveProjects: error -- ${err}`);
    }
    i += 1;
    if (i % 10 == 0) {
      logger.debug(`snapshotActiveProjects: ${i}/${v.length}`);
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
  project_id,
  namespace = context.namespace,
  snapshot,
}: {
  project_id: string;
  namespace?: string;
  snapshot?: string;
}) {
  logger.debug(`getModifiedFiles: `, { project_id, namespace });
  const { pool, snapshots } = get({ project_id, namespace });
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
      `${projectDataset({ project_id, namespace, pool })}@${snapshot}`,
    ],
    what: {
      project_id,
      namespace,
      desc: "getting files modified since last snapshot",
    },
  });
  const mnt = projectMountpoint({ project_id, namespace }) + "/";
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
